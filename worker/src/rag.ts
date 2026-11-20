/** Hybrid knowledge base (port of backend rag.py): BM25 (precomputed stats) + dense bge-small-en-v1.5 (Workers AI,
 * CLS pooling like fastembed), reciprocal-rank fusion with the same weights, metadata filters, uploads. */
import CORPUS from './generated/corpus.json';
import { CLOCK, D, expandTargets } from './data';
import { dayNum, dayStr } from './time';
import { pyRound } from './py';
import type { Env } from './env';

const C: any = CORPUS;
export const EMBED_MODEL = '@cf/baai/bge-small-en-v1.5';
export const DIM = 384;
const K1 = 1.5, B = 0.75, EPS = 0.25;

// --------------------------------------------------------------------------- tokenisation
const STOP = new Set(('a an the and or of to in on for is are was were be been it its this that with at by from as not no do does ' +
  'did has have had i we you he she they my our your there their what which who when where how why can will ' +
  'just so very too also than then').split(' '));
function stem(w: string): string {
  for (const suf of ['ing', 'ed', 'es', 's', 'ly']) if (w.length > suf.length + 3 && w.endsWith(suf)) return w.slice(0, -suf.length);
  return w;
}
export function tokenize(text: string): string[] {
  const toks = text.toLowerCase().match(/[a-z]{1,3}-\d{2,3}[a-z]?|[a-z0-9]+/g) || [];
  return toks.filter(t => !STOP.has(t)).map(stem);
}

// --------------------------------------------------------------------------- chunking (uploads; same rules as rag.py)
const GROUP_ASSETS: Record<string, string[]> = {
  pump: ['P-101A', 'P-101B', 'P-201A', 'P-201B', 'SP-P01', 'SP-P02'],
  'transfer pump': ['P-101A', 'P-101B', 'SP-P01'],
  submersible: ['P-201A', 'P-201B', 'SP-P02'],
  sump: ['P-201A', 'P-201B', 'SP-P02'],
  motor: ['M-101A', 'M-101B', 'SP-M01', 'VM-101A', 'VM-101B', 'SP-VM01', 'P-201A', 'P-201B'],
  'vibrator motor': ['VM-101A', 'VM-101B', 'SP-VM01'],
  screen: ['SC-101A', 'SC-101B', 'VM-101A', 'VM-101B'],
  panel: [],
};
export function assetsFromText(text: string): string[] {
  const ids = new Set<string>();
  for (const tok of (text || '').match(/\b(?:[A-Z]{1,2}-\d{3}[A-Z](?:\/[A-Z])?|SP-[A-Z]+\d{2})\b/g) || []) for (const t of expandTargets(tok)) ids.add(t);
  const low = (text || '').toLowerCase();
  for (const [k, v] of Object.entries(GROUP_ASSETS)) if (new RegExp(`\\b${k}s?\\b`).test(low)) v.forEach(x => ids.add(x));
  if (low.includes('all') && (low.includes('pump') || low.includes('tracked'))) Object.keys(D.asset).forEach(x => ids.add(x));
  return [...ids].filter(i => i in D.asset).sort();
}

export function chunkText(text: string, size = 1100, overlap = 150): string[] {
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length <= size) return text ? [text] : [];
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    let j = Math.min(text.length, i + size);
    if (j < text.length) {
      const start = i + Math.floor(size / 2);
      const k0 = start <= j ? text.slice(start, j).lastIndexOf('. ') : -1;
      const k = k0 >= 0 ? start + k0 : -1;
      j = k > 0 ? k + 1 : j;
    }
    out.push(text.slice(i, j).trim());
    if (j >= text.length) break;
    i = Math.max(j - overlap, i + 1);
  }
  return out;
}

const HEAD_RX = /^\s*((?:[A-Z]{2}-\d{2}|\d{1,2}\.\d{1,2}|\d{1,2}\.)\s+[A-Z][^\n]{3,90})$/gm;
export function chunkPdfDoc(pages: string[], docId: string, sourceType: string, title: string, assets: string[] | null, skipPages = 0): any[] {
  const chunks: any[] = [];
  pages.forEach((raw0, idx) => {
    const pno = idx + 1;
    if (pno <= skipPages) return;
    const raw = raw0.replace(/WWTP Maintenance Manual – Rev 0.*?Page \d+/g, ' ');
    const heads = [...raw.matchAll(HEAD_RX)].map(m => m[1]);
    const head = heads.length ? heads[0].trim() : title;
    const pid = /^([A-Z]{2}-\d{2})/.exec(head);
    const a = assets !== null ? assets : pid && pid[1] in D.procedures ? assetsFromText(D.procedures[pid[1]].equipment) : assetsFromText(raw.slice(0, 600));
    chunkText(raw).forEach((piece, i) => chunks.push({
      id: `${docId}:p${pno}:${i}`, text: `${head} – ${piece}`, source_type: sourceType, source_id: docId, page: pno,
      title: `${title} p.${pno} · ${head.slice(0, 60)}`, assets: a, group: '', procedure_id: pid ? pid[1] : null,
    }));
  });
  return chunks;
}

// --------------------------------------------------------------------------- index state
interface Chunk { id: string; text: string; source_type: string; source_id: string; title: string; page?: number | null; step?: number;
  procedure_id?: string | null; assets?: string[]; group?: string }
interface UploadRow { chunk: Chunk; tf: Record<string, number>; dl: number; vec: Float32Array }

const BUILTIN: Chunk[] = C.chunks;
const DOC_LEN: number[] = C.docLen;
const POSTINGS: Record<string, number[]> = C.postings;
const DATE_POS: Record<string, number[]> = C.datePos;
export const MANUAL_PAGES: Record<string, number[]> = C.manualPages;
export const CORPUS_VERSION: string = C.version;
export const builtinVectorsKey = () => `index/builtin-${CORPUS_VERSION}-${BUILTIN.length}.f32`;

let builtinVec: Float32Array | null = null;
let uploads: { version: string; rows: UploadRow[]; bm: any } | null = null;

async function loadBuiltinVectors(env: Env): Promise<Float32Array | null> {
  if (builtinVec) return builtinVec;
  const o = await env.FILES.get(builtinVectorsKey());
  if (!o) return null;
  builtinVec = new Float32Array(await o.arrayBuffer());
  return builtinVec;
}

const b64ToF32 = (s: string) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Float32Array(u.buffer); };
export const f32ToB64 = (v: Float32Array) => { const u = new Uint8Array(v.buffer, v.byteOffset, v.byteLength); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

async function loadUploads(env: Env) {
  const v = await env.DB.prepare("SELECT v FROM kv WHERE k = 'uploads'").first<string>('v').catch(() => null);
  const version = v ?? '0';
  if (uploads && uploads.version === version) return uploads;
  const rs = version === '0' ? { results: [] as any[] } : await env.DB.prepare('SELECT chunk, tf, dl, vec FROM upload_chunks ORDER BY seq').all();
  const rows: UploadRow[] = (rs.results as any[]).map(r => ({ chunk: JSON.parse(r.chunk), tf: JSON.parse(r.tf), dl: r.dl, vec: b64ToF32(r.vec) }));
  uploads = { version, rows, bm: bm25Stats(rows) };
  return uploads;
}

/** BM25Okapi idf table over builtin + upload chunks (rank_bm25 0.2.2 semantics, same summation order). */
function bm25Stats(rows: UploadRow[]) {
  const n = BUILTIN.length + rows.length;
  let total = 0;
  for (const l of DOC_LEN) total += l;
  for (const r of rows) total += r.dl;
  const nd = new Map<string, number>();
  for (const [t, p] of Object.entries(POSTINGS)) nd.set(t, p.length / 2);
  for (const r of rows) for (const t of Object.keys(r.tf)) nd.set(t, (nd.get(t) || 0) + 1);
  const idf = new Map<string, number>();
  let idfSum = 0;
  const neg: string[] = [];
  for (const [w, freq] of nd) {
    const v = Math.log(n - freq + 0.5) - Math.log(freq + 0.5);
    idf.set(w, v);
    idfSum += v;
    if (v < 0) neg.push(w);
  }
  const eps = EPS * (idfSum / idf.size);
  for (const w of neg) idf.set(w, eps);
  return { n, avgdl: total / n, idf };
}

export async function embed(env: Env, texts: string[]): Promise<Float32Array[]> {
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += 96) {
    const r: any = await env.AI.run(EMBED_MODEL as any, { text: texts.slice(i, i + 96), pooling: 'cls' } as any);
    for (const v of r.data) {
      const a = Float32Array.from(v as number[]);
      let s = 0; for (let j = 0; j < a.length; j++) s += a[j] * a[j];
      const nrm = Math.sqrt(s) || 1;
      for (let j = 0; j < a.length; j++) a[j] /= nrm;
      out.push(a);
    }
  }
  return out;
}

/** Built-in chunk text with the dates the backend shifts moved to today's offset. */
function chunkTextNow(c: Chunk): string {
  const pos = DATE_POS[c.id];
  if (!pos || !CLOCK.offset) return c.text;
  let t = c.text;
  for (const p of pos) {
    const s = t.slice(p, p + 10);
    const [y, m, d] = s.split('-').map(Number);
    t = t.slice(0, p) + dayStr(dayNum(y, m, d) + CLOCK.offset) + t.slice(p + 10);
  }
  return t;
}

export interface SearchOpts { k?: number; source_types?: string[] | null; asset_id?: string | null; group?: string | null; rrf_k?: number; w_dense?: number; w_bm25?: number }

export async function search(env: Env, query: string, o: SearchOpts = {}): Promise<any[]> {
  const k = o.k ?? 6, rrfK = o.rrf_k ?? 60, wDense = o.w_dense ?? 0.7, wBm = o.w_bm25 ?? 1.0;
  const [up, vecs] = await Promise.all([loadUploads(env), loadBuiltinVectors(env)]);
  const all: Chunk[] = BUILTIN.concat(up.rows.map(r => r.chunk));
  const idx: number[] = [];
  all.forEach((c, i) => {
    if (o.source_types && o.source_types.length && !o.source_types.includes(c.source_type)) return;
    if (o.asset_id && c.assets && c.assets.length && !c.assets.includes(o.asset_id)) return;
    if (o.group && !(c.group || '').toLowerCase().includes(o.group.toLowerCase())) return;
    idx.push(i);
  });
  if (!idx.length) return [];
  // BM25
  const { avgdl, idf } = up.bm;
  const bm = new Float64Array(all.length);
  const nb = BUILTIN.length;
  for (const q of tokenize(query)) {
    const w = idf.get(q) || 0;
    const p = POSTINGS[q];
    if (p) for (let j = 0; j < p.length; j += 2) {
      const qf = p[j + 1], dl = DOC_LEN[p[j]];
      bm[p[j]] += w * ((qf * (K1 + 1)) / (qf + K1 * (1 - B + (B * dl) / avgdl)));
    }
    up.rows.forEach((r, u) => {
      const qf = r.tf[q];
      if (qf) bm[nb + u] += w * ((qf * (K1 + 1)) / (qf + K1 * (1 - B + (B * r.dl) / avgdl)));
    });
  }
  // dense (exact cosine over every candidate, like the backend's full matrix product)
  const dense = new Float64Array(all.length);
  if (vecs && vecs.length === nb * DIM) {
    const [qv] = await embed(env, [query]);
    for (const i of idx) {
      let s = 0;
      if (i < nb) { const off = i * DIM; for (let j = 0; j < DIM; j++) s += vecs[off + j] * qv[j]; }
      else { const v = up.rows[i - nb].vec; for (let j = 0; j < DIM; j++) s += v[j] * qv[j]; }
      dense[i] = Math.fround(s);
    }
  }
  const stable = (key: Float64Array) => idx.slice().sort((a, b) => key[b] - key[a] || a - b);
  const fused = new Map<number, number>();
  stable(bm).forEach((i, r) => { if (bm[i] > 0) fused.set(i, (fused.get(i) || 0) + wBm / (rrfK + r + 1)); });
  if (vecs) stable(dense).forEach((i, r) => { fused.set(i, (fused.get(i) || 0) + wDense / (rrfK + r + 1)); });
  const order = [...fused.keys()];
  const ranked = order.map((i, n) => ({ i, n })).sort((a, b) => fused.get(b.i)! - fused.get(a.i)! || a.n - b.n).map(x => x.i);
  const best: number[] = [], seen = new Set<string>();
  for (const i of ranked) {
    const c = all[i];
    const key = c.source_type === 'symptom' ? c.source_id : c.id;
    if (seen.has(key)) continue;
    seen.add(key);
    best.push(i);
    if (best.length >= k) break;
  }
  return best.map(i => {
    const c = all[i];
    return {
      id: c.id, source_type: c.source_type, source_id: c.source_id, title: c.title ?? null, page: c.page ?? null, step: c.step ?? null,
      procedure_id: c.procedure_id ?? null, text: (i < nb ? chunkTextNow(c) : c.text).slice(0, 900),
      score: pyRound(fused.get(i)!, 5), dense: pyRound(dense[i], 3), bm25: pyRound(bm[i], 2),
    };
  });
}

export async function kbStatus(env: Env) {
  const [up, vecs] = await Promise.all([loadUploads(env), loadBuiltinVectors(env)]);
  return { ready: !!vecs, chunks: BUILTIN.length + up.rows.length };
}

// --------------------------------------------------------------------------- docs / uploads
const LABELS: Record<string, string> = {
  symptom: 'Symptoms + diagnostic questions', procedure: 'Procedures (header, key points, figures)',
  procedure_steps: 'Procedure steps', failure: 'Failure history (lessons learned)',
  manual: 'WWTP Maintenance Manual (PDF)', ir_format: 'Incident Report Format guide (PDF)',
};
export async function listDocs(env: Env) {
  const builtin = new Map<string, number>();
  for (const c of BUILTIN) builtin.set(c.source_type, (builtin.get(c.source_type) || 0) + 1);
  const rs = await env.DB.prepare('SELECT meta FROM docs ORDER BY seq').all();
  return {
    builtin: [...builtin].map(([k, v]) => ({ source_type: k, title: LABELS[k] ?? k, chunks: v })),
    uploads: (rs.results as any[]).map(r => JSON.parse(r.meta)),
  };
}

export async function getDoc(env: Env, docId: string): Promise<any | null> {
  const r = await env.DB.prepare('SELECT meta FROM docs WHERE doc_id = ?').bind(docId).first<string>('meta');
  return r ? JSON.parse(r) : null;
}

/** Index a parsed upload: chunk, embed, store chunk text + BM25 term freqs + vector in D1, mirror vectors to Vectorize. */
export async function indexUpload(env: Env, d: any, pages: string[]): Promise<number> {
  const chunks = chunkPdfDoc(pages, d.doc_id, 'upload', d.title, d.asset_id ? [d.asset_id] : []);
  for (const c of chunks) c.group = d.equipment_model || '';
  const vecs = await embed(env, chunks.map(c => c.text));
  const seq0 = Date.now() * 1000;
  const stmts = chunks.map((c, i) => {
    const toks = tokenize(c.text + ' ' + (c.title || ''));
    const tf: Record<string, number> = {};
    for (const t of toks) tf[t] = (tf[t] || 0) + 1;
    return env.DB.prepare('INSERT INTO upload_chunks (id, doc_id, seq, chunk, tf, dl, vec) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(c.id, d.doc_id, seq0 + i, JSON.stringify(c), JSON.stringify(tf), toks.length, f32ToB64(vecs[i]));
  });
  d.chunks = chunks.length;
  stmts.push(env.DB.prepare('INSERT INTO docs (doc_id, seq, meta) VALUES (?, ?, ?)').bind(d.doc_id, seq0, JSON.stringify(d)));
  stmts.push(bumpUploads(env));
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  if (chunks.length) {
    try {
      await env.VEC.upsert(chunks.map((c, i) => ({ id: c.id, values: Array.from(vecs[i]), metadata: { source_type: 'upload', source_id: d.doc_id } })));
    } catch (e) { console.log('vectorize upsert failed', String(e)); }
  }
  return chunks.length;
}

const bumpUploads = (env: Env) => env.DB.prepare("INSERT INTO kv (k, v) VALUES ('uploads', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(String(Date.now()) + Math.random().toString(36).slice(2, 6));

export async function deleteDoc(env: Env, docId: string): Promise<boolean> {
  const d = await getDoc(env, docId);
  if (!d) return false;
  const ids = ((await env.DB.prepare('SELECT id FROM upload_chunks WHERE doc_id = ?').bind(docId).all()).results as any[]).map(r => r.id);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM upload_chunks WHERE doc_id = ?').bind(docId),
    env.DB.prepare('DELETE FROM docs WHERE doc_id = ?').bind(docId), bumpUploads(env)]);
  await env.FILES.delete(`uploads/${d.stored_as}`);
  if (ids.length) { try { await env.VEC.deleteByIds(ids); } catch (e) { console.log('vectorize delete failed', String(e)); } }
  return true;
}

// --------------------------------------------------------------------------- seeding the built-in vectors
export async function seed(env: Env): Promise<any> {
  const vecs = await embed(env, BUILTIN.map(c => c.text));
  const flat = new Float32Array(BUILTIN.length * DIM);
  vecs.forEach((v, i) => flat.set(v, i * DIM));
  await env.FILES.put(builtinVectorsKey(), flat.buffer);
  builtinVec = flat;
  let upserted = 0;
  try {
    for (let i = 0; i < BUILTIN.length; i += 100) {
      const part = BUILTIN.slice(i, i + 100);
      await env.VEC.upsert(part.map((c, j) => ({ id: c.id, values: Array.from(vecs[i + j]), metadata: { source_type: c.source_type, source_id: c.source_id } })));
      upserted += part.length;
    }
  } catch (e) { return { ok: true, chunks: BUILTIN.length, vectorize: `failed: ${String(e)}` }; }
  return { ok: true, chunks: BUILTIN.length, key: builtinVectorsKey(), vectorize_upserted: upserted };
}

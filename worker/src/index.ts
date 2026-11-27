/** GearCast API on Cloudflare Workers (port of backend main.py; same paths and JSON/SSE shapes) + static app. */
import type { Env } from './env';
import { D, setContext, nowStr } from './data';
import { makeClock } from './time';
import * as tools from './tools';
import * as rr from './rr';
import * as rag from './rag';
import * as inc from './incidents';
import { troubleshoot } from './troubleshoot';
import { runChat } from './chat';
import { model } from './llm';
import { UploadError, extractText, suffixStem } from './uploads';
import { renderDocx, loadTemplate, filledTree, photoRid, Template, type DocImage } from './doc/render';
import { docToPdf, PdfFonts } from './doc/pdf';
import { auth, sessionUser, type User } from './auth';
import { blocked } from './rbac';
import { trendsFor, trendOpts, trendIndicators, withDefaults, TREND_WINDOWS } from './trend';
import * as ap from './approvals';
import * as pl from './plants';
import * as qr from './scans';
import { QuotaError, charge, chargeStorage, releaseStorage, usage } from './quota';

class HTTP extends Error { constructor(public status: number, public detail: any) { super(typeof detail === 'string' ? detail : 'error'); } }
const json = (o: any, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const bad = (msg: string, loc: string[] = ['body']) => new HTTP(422, [{ type: 'missing', loc, msg }]);

async function body(req: Request): Promise<any> {
  try { return await req.json(); } catch { throw new HTTP(422, [{ type: 'json_invalid', loc: ['body'], msg: 'JSON decode error' }]); }
}
const obj = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);
const sim = (v: any) => (obj(v) ? { overrides: obj(v.overrides) ? v.overrides : {}, roleOverrides: obj(v.roleOverrides) ? v.roleOverrides : {} } : null);

// ------------------------------------------------------------------ document assets (template + fonts, served as static files)
let TPL: Template | null = null, FONTS: PdfFonts | null = null;
async function asset(env: Env, path: string): Promise<Uint8Array> {
  const r = await env.ASSETS.fetch(new Request(`https://assets.local${path}`));
  if (!r.ok) throw new HTTP(500, `asset ${path} missing`);
  return new Uint8Array(await r.arrayBuffer());
}
async function docAssets(env: Env) {
  if (!TPL) TPL = loadTemplate(await asset(env, '/forms/Incident_Report_Form_v1.2.docx'));
  if (!FONTS) FONTS = { regular: await asset(env, '/forms/DejaVuSansCondensed.ttf'), bold: await asset(env, '/forms/DejaVuSansCondensed-Bold.ttf') };
  return { tpl: TPL, fonts: FONTS };
}
async function draftPdf(env: Env, draft: any): Promise<Uint8Array> {
  const { tpl, fonts } = await docAssets(env);
  const images: Record<string, DocImage> = {};
  for (const [i, ph] of (draft.photos || []).entries()) {
    const o = draft.report_id ? await env.FILES.get(photoKey(draft.report_id, i + 1)) : null;
    if (o) images[photoRid(i)] = { w: ph.w, h: ph.h, ext: ph.ext, bytes: new Uint8Array(await o.arrayBuffer()) };
  }
  return docToPdf(filledTree(tpl, draft, { images, vectorCharts: true }), fonts, `GearCast · ${draft.report_id ?? ''} · generated ${nowStr()}`, true,
    { images, charts: draft.tables?.trends || [] });
}
// v3: Field 3 charts with selectable range/indicators, aggregation and failure marker; older PDFs re-render on first download
const pdfKey = (id: string) => `pdfs/v3/${id}.pdf`;
const photoKey = (id: string, n: number) => `photos/${id}/${n}`;
const MAX_PHOTOS = 4, MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const cleanPhotos = (v: any) => (Array.isArray(v) ? v : []).slice(0, MAX_PHOTOS).map((p: any) => ({
  caption: String(p?.caption ?? '').slice(0, 300), w: Math.max(1, Number(p?.w) || 4), h: Math.max(1, Number(p?.h) || 3), ext: p?.ext === 'png' ? 'png' : 'jpeg' }));
const pdfResp = (data: Uint8Array | ArrayBuffer, name: string) =>
  new Response(data, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}.pdf"` } });

/** Side effects of an approved record. PM findings and spare deployments are read from the approvals table by the app
 *  (last-done dates, stock issued); an approved layout change is published as the plant's shared layout. */
async function applyApproval(env: Env, a: ap.Approval) {
  if (a.kind === 'layout_change') {
    await pl.publish(env, a.payload.plant_id, a.payload.doc, `${a.created_by} (approved by ${a.reviewed_by})`);
  }
}

// ------------------------------------------------------------------ routes
async function route(req: Request, env: Env, ctx: ExecutionContext, url: URL, user: User | null): Promise<Response> {
  const p = url.pathname, m = req.method, q = url.searchParams;
  const seg = p.split('/').slice(2).map(decodeURIComponent); // after /api

  if (p === '/api/health' && m === 'GET') {
    const kb = await rag.kbStatus(env);
    return json({ ok: true, model: model(env), llm_configured: !!env.DEEPSEEK_API_KEY, kb_ready: kb.ready, kb_chunks: kb.chunks, pdf_export: false });
  }
  if (seg[0] === 'auth') return auth(req, env, seg.slice(1));
  if (p === '/api/usage' && m === 'GET') return json(await usage(env));

  if (seg[0] === 'tools' && seg.length === 2 && m === 'POST') {
    const b = await body(req);
    if (!obj(b)) throw bad('Input should be a valid dictionary');
    const s = b.sim; delete b.sim;
    const { StatusCtx } = await import('./data');
    return json(await tools.runTool(env, StatusCtx.fromClient(s), seg[1], b));
  }
  if (p === '/api/chat' && m === 'POST') {
    const b = await body(req);
    if (!obj(b) || !Array.isArray(b.messages)) throw bad('Field required', ['body', 'messages']);
    return new Response(runChat(env, b.messages, sim(b.sim), obj(b.client) ? b.client : null),
      { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' } });
  }
  if (p === '/api/troubleshoot' && m === 'POST') {
    const b = await body(req);
    const query = typeof b.query === 'string' ? b.query : '';
    if (!query.trim() && !b.symptom_id) throw new HTTP(400, 'query required');
    const answers = (Array.isArray(b.answers) ? b.answers : []).map((a: any) => ({ question_id: String(a.question_id), answer: String(a.answer) }));
    return json(await troubleshoot(env, query, b.asset_id ?? null, answers, b.symptom_id ?? null, sim(b.sim), !!b.skip_questions));
  }

  // knowledge
  if (p === '/api/knowledge/docs' && m === 'GET') return json(await rag.listDocs(env));
  if (p === '/api/knowledge/search' && m === 'GET') {
    const qq = q.get('q');
    if (qq === null) throw bad('Field required', ['query', 'q']);
    const k = q.has('k') ? parseInt(q.get('k')!, 10) : 6;
    if (Number.isNaN(k)) throw bad('Input should be a valid integer', ['query', 'k']);
    const st = q.get('source_types');
    return json({ query: qq, results: await rag.search(env, qq, { k, asset_id: q.get('asset_id') || null, source_types: st ? st.split(',') : null }) });
  }
  if (p === '/api/knowledge/upload' && m === 'POST') {
    const form = await req.formData();
    const file = form.get('file') as unknown as File | null;
    if (!file || typeof file === 'string') throw bad('Field required', ['body', 'file']);
    const data = new Uint8Array(await file.arrayBuffer());
    if (data.length > 25 * 1024 * 1024) throw new HTTP(413, 'File too large (max 25 MB)');
    const filename = file.name || 'upload.txt';
    const assetId = (String(form.get('asset_id') || '')).toUpperCase() || null;
    const [ext, stem] = suffixStem(filename);
    let pages: string[];
    try { pages = await extractText(filename, data); } catch (e) { if (e instanceof UploadError) throw new HTTP(400, e.message); throw e; }
    await charge(env, 'upload', 'LIMIT_UPLOADS_DAY');
    await chargeStorage(env, data.length, 'upload_bytes');
    const docId = 'DOC-' + crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    const stored = `${docId}${ext.toLowerCase()}`;
    await env.FILES.put(`uploads/${stored}`, data);
    const d: any = { doc_id: docId, filename, stored_as: stored, title: (form.get('title') as string) || stem,
      asset_id: assetId || null, equipment_model: (form.get('equipment_model') as string) || null, uploaded_at: nowStr(), bytes: data.length };
    try { await rag.indexUpload(env, d, pages); } catch (e) { // e.g. embedding cap reached: don't leave an orphan file in R2
      await env.FILES.delete(`uploads/${stored}`); await releaseStorage(env, data.length); throw e;
    }
    return json(d);
  }
  if (seg[0] === 'knowledge' && seg[1] === 'docs' && seg.length === 4 && seg[3] === 'file' && m === 'GET') {
    // open an uploaded manual (Knowledge base → Open, and from retrieval hits)
    const d = await rag.getDoc(env, seg[2]);
    const o = d?.stored_as ? await env.FILES.get(`uploads/${d.stored_as}`) : null;
    if (!o) throw new HTTP(404, 'not found');
    const ext = String(d.stored_as).split('.').pop()!.toLowerCase();
    const type = ext === 'pdf' ? 'application/pdf' : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'text/plain; charset=utf-8';
    const name = String(d.filename || d.stored_as).replace(/[^\w.\- ]+/g, '_');
    return new Response(o.body, { headers: { 'Content-Type': type, 'Content-Disposition': `${ext === 'docx' ? 'attachment' : 'inline'}; filename="${name}"`,
      'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
  }
  if (seg[0] === 'knowledge' && seg[1] === 'source' && seg.length === 4 && m === 'GET') {
    // open a structured retrieval hit (procedure, symptom, failure record) in full
    const r = seg[2] === 'upload' ? await rag.uploadRecord(env, seg[3]) : rag.sourceRecord(seg[2], seg[3]);
    if (!r) throw new HTTP(404, 'not found');
    return json(r);
  }
  if (seg[0] === 'knowledge' && seg[1] === 'docs' && seg.length === 3 && m === 'DELETE') {
    if (!(await rag.deleteDoc(env, seg[2]))) throw new HTTP(404, 'not found');
    return json({ ok: true });
  }

  // incidents
  if (p === '/api/incidents/draft' && m === 'POST') {
    const b = await body(req);
    if (!obj(b) || typeof b.asset_id !== 'string') throw bad('Field required', ['body', 'asset_id']);
    const f: any = {};
    for (const k of inc.DRAFT_KEYS) f[k] = b[k] ?? null;
    f.shut_down = !!b.shut_down;
    if (f.downtime_h !== null) { const n = Number(f.downtime_h); if (Number.isNaN(n)) throw bad('Input should be a valid number', ['body', 'downtime_h']); f.downtime_h = n; }
    const noLlm = env.DEV_MODE === '1' && q.get('no_llm') === '1';
    try { return json(await inc.buildDraft(env, f, sim(b.sim), !noLlm)); } catch (e: any) {
      if (String(e?.message).startsWith('Unknown asset')) throw new HTTP(400, e.message);
      throw e;
    }
  }
  if (p === '/api/incidents/trends' && m === 'GET') {
    // Field 3 time range + indicator picker: re-chart the readings without re-drafting the report.
    // ?report_id= charts a stored report (its saved choice unless days/from/indicators are given).
    const given = q.has('days') || q.has('from') || q.has('indicators');
    const asked = given ? trendOpts({ days: q.get('days'), from: q.get('from'), indicators: q.get('indicators') }) : null;
    const rid = q.get('report_id');
    if (rid) {
      const src = await inc.trendSource(env, rid);
      if (!src) throw new HTTP(404, 'not found');
      const known = !!D.asset[src.asset_id];
      const t0 = asked ?? src.trend ?? trendOpts({ days: src.rec?.tables?.trends?.[0]?.window_days }), trend = known ? withDefaults(src.asset_id, t0) : t0;
      // a submitted report shows the charts stored with it (as submitted, or as last saved with PUT …/trend)
      const trends = !asked && src.rec?.tables?.trends ? src.rec.tables.trends : known ? trendsFor(src.asset_id, src.failure_at, trend, src.frame) : [];
      return json({ report_id: rid, asset_id: src.asset_id, failure_at: src.failure_at, saved: src.trend, trend, windows: TREND_WINDOWS,
        indicators: known ? trendIndicators(src.asset_id) : [], trends });
    }
    const aid = (q.get('asset_id') || '').toUpperCase();
    if (!D.asset[aid]) throw new HTTP(400, `Unknown asset ${aid}`);
    const trend = withDefaults(aid, asked ?? trendOpts(null));
    return json({ asset_id: aid, days: trend.days, trend, windows: TREND_WINDOWS, indicators: trendIndicators(aid), trends: trendsFor(aid, q.get('failure_at'), trend) });
  }
  if (p === '/api/incidents/render' && m === 'POST') {
    const draft = await body(req);
    const name = draft.report_id ?? 'IR-draft';
    if ((q.get('format') || 'docx') === 'pdf') return pdfResp(await draftPdf(env, draft), name);
    const { tpl } = await docAssets(env);
    return new Response(renderDocx(tpl, draft), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${name}.docx"` } });
  }
  if (p === '/api/incidents' && m === 'POST') {
    const draft = await body(req);
    if (!obj(draft) || !draft.asset_id || !draft.fields || !draft.fields.length) throw new HTTP(400, 'draft with asset_id and fields required');
    // The PDF is rendered from the stored record by the app right after submission (worker/src/doc, in the browser:
    // too CPU-heavy for the Workers free plan) and uploaded with PUT /api/incidents/{id}/pdf.
    draft.photos = cleanPhotos(draft.photos);
    const { out } = await inc.submit(env, draft);
    return json(out);
  }
  if (p === '/api/incidents' && m === 'GET') return json(await inc.listReports(env));
  if (seg[0] === 'incidents' && seg.length === 2) {
    if (m === 'GET') { const r = await inc.getReport(env, seg[1]); if (!r) throw new HTTP(404, 'not found'); return json(r); }
    if (m === 'DELETE') {
      if (!(await inc.deleteReport(env, seg[1]))) throw new HTTP(404, 'Only reports submitted in GearCast can be deleted');
      const objs = [...(await env.FILES.list({ prefix: `photos/${seg[1]}/` })).objects];
      const old = await env.FILES.head(pdfKey(seg[1]));
      if (old) objs.push(old);
      if (objs.length) await env.FILES.delete(objs.map(o => o.key));
      await releaseStorage(env, objs.reduce((a, o) => a + o.size, 0));
      return json({ ok: true });
    }
  }
  if (seg[0] === 'incidents' && seg.length === 3 && seg[2] === 'pdf' && m === 'GET') {
    const id = seg[1];
    const o = await env.FILES.get(pdfKey(id));
    if (o) return pdfResp(await o.arrayBuffer(), id);
    const r = await inc.getReport(env, id);
    if (!r) throw new HTTP(404, 'not found');
    if (q.get('render') === 'server') { // CPU-heavy (hundreds of ms): only for paid plans / local dev
      const data = await draftPdf(env, 'history' in r ? inc.historyDraft(r.history, await inc.historyTrend(env, id)) : r);
      ctx.waitUntil(chargeStorage(env, data.length, null).then(() => env.FILES.put(pdfKey(id), data)).catch(() => {}));
      return pdfResp(data, id);
    }
    return json({ detail: 'PDF not generated yet', render: `/api/incidents/${encodeURIComponent(id)}/pdf-source` }, 409);
  }
  if (seg[0] === 'incidents' && seg.length === 4 && seg[2] === 'photos') {
    const id = seg[1], n = parseInt(seg[3], 10);
    if (!(n >= 1 && n <= MAX_PHOTOS)) throw new HTTP(404, 'not found');
    if (m === 'GET') {
      const o = await env.FILES.get(photoKey(id, n));
      if (!o) throw new HTTP(404, 'not found');
      return new Response(o.body, { headers: { 'Content-Type': o.httpMetadata?.contentType || 'image/jpeg', 'Cache-Control': 'private, max-age=86400' } });
    }
    if (m === 'PUT') {
      const r = await inc.getReport(env, id);
      if (!r || 'history' in r) throw new HTTP(404, 'not found');
      if (!(r.photos || [])[n - 1]) throw new HTTP(400, `report has no photo ${n}`);
      if (await env.FILES.head(photoKey(id, n))) return json({ ok: true, stored: false, note: 'already stored' });
      const data = new Uint8Array(await req.arrayBuffer());
      const png = data[0] === 0x89 && data[1] === 0x50, jpg = data[0] === 0xff && data[1] === 0xd8;
      if (!(png || jpg) || data.length > MAX_PHOTO_BYTES) throw new HTTP(400, 'expected a JPEG or PNG photo (max 3 MB)');
      await charge(env, 'photo', 'LIMIT_PHOTOS_DAY');
      await chargeStorage(env, data.length, null);
      await env.FILES.put(photoKey(id, n), data, { httpMetadata: { contentType: png ? 'image/png' : 'image/jpeg' } });
      return json({ ok: true, stored: true });
    }
  }
  if (seg[0] === 'incidents' && seg.length === 3 && seg[2] === 'pdf-source' && m === 'GET') {
    const r = await inc.getReport(env, seg[1]);
    if (!r) throw new HTTP(404, 'not found');
    const draft = 'history' in r ? inc.historyDraft(r.history, await inc.historyTrend(env, seg[1])) : r;
    return json({ draft, footer: `GearCast · ${draft.report_id ?? ''} · generated ${nowStr()}` });
  }
  if (seg[0] === 'incidents' && seg.length === 3 && seg[2] === 'trend' && m === 'PUT') {
    // save Field 3's range + indicators with a stored report; its PDF is re-rendered by the app (old one dropped)
    const b = await body(req);
    const out = await inc.setReportTrend(env, seg[1], obj(b) ? b : {});
    if (!out) throw new HTTP(404, 'not found');
    const old = await env.FILES.head(pdfKey(seg[1]));
    if (old) { await env.FILES.delete(old.key); await releaseStorage(env, old.size); }
    return json({ ok: true, ...out });
  }
  if (seg[0] === 'incidents' && seg.length === 3 && seg[2] === 'pdf' && m === 'PUT') {
    const id = seg[1];
    if (!(await inc.getReport(env, id))) throw new HTTP(404, 'not found');
    if (await env.FILES.head(pdfKey(id))) return json({ ok: true, stored: false, note: 'already generated' });
    const data = new Uint8Array(await req.arrayBuffer());
    if (data.length > 8 * 1024 * 1024 || data.length < 5 || String.fromCharCode(...data.slice(0, 5)) !== '%PDF-') throw new HTTP(400, 'expected a PDF (max 8 MB)');
    await charge(env, 'pdf', 'LIMIT_PDF_WRITES_DAY');
    await chargeStorage(env, data.length, null);
    await env.FILES.put(pdfKey(id), data, { httpMetadata: { contentType: 'application/pdf' } });
    return json({ ok: true, stored: true });
  }

  // PM task assignments (shared so technicians see the tasks a supervisor or engineer assigned to them)
  if (p === '/api/pm/assignments' && m === 'GET') {
    const v = await env.DB.prepare("SELECT v FROM kv WHERE k = 'pm_assign'").first<string>('v');
    const a: Record<string, string> = v ? JSON.parse(v) : {};
    for (const k of Object.keys(a)) a[k] = a[k].replace(/^OP-(\d{2})$/, 'PS-$1'); // operators were renamed plant supervisors
    return json({ assignments: a });
  }
  if (p === '/api/pm/assignments' && m === 'PUT') {
    const b = await body(req);
    if (!obj(b) || !obj(b.assignments)) throw bad('Field required', ['body', 'assignments']);
    const a: Record<string, string> = {};
    for (const [k, v] of Object.entries(b.assignments)) if (typeof v === 'string' && v) a[k] = v;
    await env.DB.prepare("INSERT INTO kv (k, v) VALUES ('pm_assign', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(a)).run();
    return json({ assignments: a });
  }

  // approvals: PM findings, spare deployments, layout changes
  if (p === '/api/approvals' && m === 'GET') return json({ approvals: await ap.list(env, q.get('kind'), q.get('status'), true) });
  if (p === '/api/approvals' && m === 'POST') {
    // multipart: kind, payload (JSON), optional `file` (scanned job sheet: PDF/JPEG/PNG) and `photo1`..`photoN` (JPEG/PNG)
    let kind = '', payload: any = null, file: File | null = null;
    const photoFiles: File[] = [];
    if ((req.headers.get('Content-Type') || '').includes('multipart/form-data')) {
      const form = await req.formData();
      kind = String(form.get('kind') || '');
      try { payload = JSON.parse(String(form.get('payload') || '{}')); } catch { throw bad('payload must be JSON', ['body', 'payload']); }
      const f = form.get('file') as unknown as File | null;
      if (f && typeof f !== 'string' && f.size) file = f;
      for (let i = 1; i <= ap.MAX_PHOTOS; i++) {
        const ph = form.get(`photo${i}`) as unknown as File | null;
        if (ph && typeof ph !== 'string' && ph.size) photoFiles.push(ph);
      }
    } else { const b = await body(req); kind = String(b?.kind || ''); payload = b?.payload; }
    if ((file || photoFiles.length) && kind !== 'pm_findings') throw new HTTP(400, 'Files can only be attached to PM findings');
    if (kind === 'layout_change' && !(await pl.canOpen(env, user!, String(payload?.plant_id || '')))) throw new HTTP(403, 'You do not have access to this plant');
    const sniff = (d: Uint8Array) => (String.fromCharCode(...d.slice(0, 5)) === '%PDF-' ? 'application/pdf'
      : d[0] === 0x89 && d[1] === 0x50 ? 'image/png' : d[0] === 0xff && d[1] === 0xd8 ? 'image/jpeg' : null);
    let meta: ap.FileMeta | null = null, data: Uint8Array | null = null;
    const photos: { meta: ap.FileMeta; data: Uint8Array }[] = [];
    if (file) {
      data = new Uint8Array(await file.arrayBuffer());
      const type = sniff(data);
      if (!type || data.length > ap.MAX_SCAN_BYTES) throw new HTTP(400, 'Scanned job sheet must be a PDF, JPEG or PNG (max 8 MB)');
      meta = { type, name: (file.name || 'scan').slice(0, 120), bytes: data.length };
    }
    for (const f of photoFiles) {
      const d = new Uint8Array(await f.arrayBuffer()), type = sniff(d);
      if (!type || type === 'application/pdf' || d.length > ap.MAX_PHOTO_BYTES) throw new HTTP(400, 'Photos must be JPEG or PNG (max 4 MB each)');
      photos.push({ meta: { type, name: (f.name || 'photo').slice(0, 120), bytes: d.length }, data: d });
    }
    const total = (data?.length ?? 0) + photos.reduce((n, x) => n + x.data.length, 0);
    if (total) {
      await charge(env, 'upload', 'LIMIT_UPLOADS_DAY');
      await chargeStorage(env, total, 'upload_bytes');
    }
    try {
      const a = await ap.create(env, user!, kind, payload, meta, photos.map(x => x.meta));
      if (data) await env.FILES.put(ap.fileKey(a.id), data, { httpMetadata: { contentType: meta!.type } });
      for (const [i, x] of photos.entries()) await env.FILES.put(ap.photoKey(a.id, i + 1), x.data, { httpMetadata: { contentType: x.meta.type } });
      if (a.status === 'approved') await applyApproval(env, a);
      return json(a);
    } catch (e) { if (total) await releaseStorage(env, total); throw e; }
  }
  if (seg[0] === 'approvals' && seg.length === 4 && seg[2] === 'photos' && m === 'GET') {
    // photos taken during the PM (findings form), viewable by the approver and the technician
    const a = await ap.get(env, seg[1]), n = parseInt(seg[3], 10);
    const ph = (a?.payload?.photos || []).find((x: any) => x.n === n);
    const o = ph ? await env.FILES.get(ap.photoKey(a!.id, n)) : null;
    if (!o) throw new HTTP(404, 'not found');
    return new Response(o.body, { headers: { 'Content-Type': ph.type, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' } });
  }
  if (seg[0] === 'approvals' && seg.length === 2 && m === 'GET') {
    const a = await ap.get(env, seg[1]);
    if (!a) throw new HTTP(404, 'not found');
    return json(a);
  }
  if (seg[0] === 'approvals' && seg.length === 3 && seg[2] === 'file' && m === 'GET') {
    const a = await ap.get(env, seg[1]);
    const o = a?.file ? await env.FILES.get(ap.fileKey(a.id)) : null;
    if (!o || !a?.file) throw new HTTP(404, 'not found');
    return new Response(o.body, { headers: { 'Content-Type': a.file.type, 'Content-Disposition': `inline; filename="${a.file.name.replace(/[^\w.\- ]+/g, '_')}"`,
      'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
  }
  if (seg[0] === 'approvals' && seg.length === 3 && seg[2] === 'review' && m === 'POST') {
    const b = await body(req);
    const a = await ap.review(env, user!, seg[1], String(b?.decision || ''), String(b?.note || ''));
    if (a.status === 'approved') await applyApproval(env, a);
    return json(a);
  }

  // plants: shared layouts + access (Plant Supervisor publishes and grants; others read)
  if (p === '/api/plants' && m === 'GET') return json(await pl.list(env, user!));
  if (p === '/api/plants/access' && m === 'GET') {
    const mine = !(user!.role === 'supervisor');
    return json({ grants: await pl.grants(env, mine ? user!.username : undefined), users: mine ? [] : await pl.users(env) });
  }
  if (p === '/api/plants/access' && m === 'POST') return json(await pl.grant(env, user!, await body(req)));
  if (p === '/api/plants/access' && m === 'DELETE') { await pl.revoke(env, q.get('username') || '', q.get('plant_id') || ''); return json({ ok: true }); }
  if (seg[0] === 'plants' && seg.length === 2 && seg[1] !== 'access') {
    if (m === 'PUT') { const b = await body(req); await pl.publish(env, seg[1], b?.doc, user!.username); return json({ ok: true }); }
    if (m === 'DELETE') { await pl.remove(env, seg[1]); return json({ ok: true }); }
  }

  // QR scanning: label lookup, scan log (D1 + the workbook's pilot Scan_Log), print labels
  if (p === '/api/qr/tags' && m === 'GET') return json({ tags: qr.tags() });
  if (p === '/api/qr/resolve' && m === 'GET') return json(await qr.resolve(env, user!, q.get('code') || ''));
  if (p === '/api/scans' && m === 'POST') return json(await qr.log(env, user!, await body(req)));
  if (p === '/api/scans' && m === 'GET') {
    const aid = (q.get('asset_id') || '').toUpperCase() || null;
    if (aid) await qr.resolve(env, user!, aid); // plant access
    return json({ scans: await qr.history(env, aid, parseInt(q.get('limit') || '50', 10)) });
  }
  if (seg[0] === 'scans' && seg.length === 2 && m === 'PATCH') return json(await qr.update(env, user!, seg[1], await body(req)));

  // repair or replace
  if (p === '/api/rr/cases' && m === 'GET') return json({ model: rr.MODEL_INFO, cases: rr.cases() });
  if (seg[0] === 'rr' && seg[1] === 'predict' && seg.length === 3 && m === 'GET') {
    const rc = q.get('repair_cost_php');
    if (rc !== null && Number.isNaN(Number(rc))) throw bad('Input should be a valid number', ['query', 'repair_cost_php']);
    return json(tools.repairOrReplace(seg[2], null, rc === null || rc === '' ? null : Number(rc)));
  }

  if (seg[0] === 'rr' && seg[1] === 'replacement' && seg.length === 3 && m === 'GET') {
    const r = rr.replacementOptions(seg[2].toUpperCase());
    if (!r) throw new HTTP(404, `Unknown asset ${seg[2]}`);
    return json(r);
  }

  // admin: seed the built-in vectors (Workers AI → R2 + Vectorize)
  if (p === '/api/admin/seed' && m === 'POST') {
    if (!env.ADMIN_TOKEN || req.headers.get('x-admin-token') !== env.ADMIN_TOKEN) throw new HTTP(403, 'forbidden');
    return json(await rag.seed(env));
  }
  throw new HTTP(404, 'Not Found');
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/docs/')) { // built-in manuals: signed-in users only
      if (!(await sessionUser(req, env))) return new Response('Sign in to GearCast to open this document.', { status: 401 });
      return env.ASSETS.fetch(req);
    }
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    const t0 = Date.now();
    const devAsOf = env.DEV_MODE === '1' ? req.headers.get('x-gearcast-as-of') : null;
    setContext(makeClock(devAsOf, Number(env.TZ_OFFSET_MIN || 480)));
    void D;
    try {
      let u: User | null = null;
      if (!url.pathname.startsWith('/api/auth/') && url.pathname !== '/api/health') {
        u = await sessionUser(req, env);
        if (!u) return json({ detail: 'Not signed in' }, 401);
        if (blocked(u.role, req.method, url.pathname)) return json({ detail: 'Your role does not have access to this action' }, 403);
      }
      return await route(req, env, ctx, url, u);
    } catch (e: any) {
      if (e instanceof HTTP) return json({ detail: e.detail }, e.status);
      if (e instanceof QuotaError) return json({ detail: e.message }, 429);
      if (e instanceof ap.ApprovalError || e instanceof pl.PlantError || e instanceof qr.ScanError) return json({ detail: e.message }, e.status);
      console.log('error', url.pathname, e?.stack || String(e));
      return json({ detail: 'Internal Server Error' }, 500);
    } finally {
      if (env.DEV_MODE === '1') console.log(`${req.method} ${url.pathname} ${Date.now() - t0}ms`);
    }
  },
} satisfies ExportedHandler<Env>;

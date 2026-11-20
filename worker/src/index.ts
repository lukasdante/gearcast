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
import { renderDocx, loadTemplate, filledTree, Template } from './doc/render';
import { docToPdf, PdfFonts } from './doc/pdf';
import { auth, sessionUser, technicianBlocked } from './auth';

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
  return docToPdf(filledTree(tpl, draft), fonts, `GearCast · ${draft.report_id ?? ''} · generated ${nowStr()}`);
}
const pdfKey = (id: string) => `pdfs/${id}.pdf`;
const pdfResp = (data: Uint8Array | ArrayBuffer, name: string) =>
  new Response(data, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}.pdf"` } });

// ------------------------------------------------------------------ routes
async function route(req: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const p = url.pathname, m = req.method, q = url.searchParams;
  const seg = p.split('/').slice(2).map(decodeURIComponent); // after /api

  if (p === '/api/health' && m === 'GET') {
    const kb = await rag.kbStatus(env);
    return json({ ok: true, model: model(env), llm_configured: !!env.DEEPSEEK_API_KEY, kb_ready: kb.ready, kb_chunks: kb.chunks, pdf_export: false });
  }
  if (seg[0] === 'auth') return auth(req, env, seg.slice(1));

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
    const docId = 'DOC-' + crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    const stored = `${docId}${ext.toLowerCase()}`;
    await env.FILES.put(`uploads/${stored}`, data);
    const d: any = { doc_id: docId, filename, stored_as: stored, title: (form.get('title') as string) || stem,
      asset_id: assetId || null, equipment_model: (form.get('equipment_model') as string) || null, uploaded_at: nowStr(), bytes: data.length };
    await rag.indexUpload(env, d, pages);
    return json(d);
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
    const { out } = await inc.submit(env, draft);
    return json(out);
  }
  if (p === '/api/incidents' && m === 'GET') return json(await inc.listReports(env));
  if (seg[0] === 'incidents' && seg.length === 2) {
    if (m === 'GET') { const r = await inc.getReport(env, seg[1]); if (!r) throw new HTTP(404, 'not found'); return json(r); }
    if (m === 'DELETE') {
      if (!(await inc.deleteReport(env, seg[1]))) throw new HTTP(404, 'Only reports submitted in GearCast can be deleted');
      await env.FILES.delete(pdfKey(seg[1]));
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
      const data = await draftPdf(env, 'history' in r ? inc.historyDraft(r.history) : r);
      ctx.waitUntil(env.FILES.put(pdfKey(id), data));
      return pdfResp(data, id);
    }
    return json({ detail: 'PDF not generated yet', render: `/api/incidents/${encodeURIComponent(id)}/pdf-source` }, 409);
  }
  if (seg[0] === 'incidents' && seg.length === 3 && seg[2] === 'pdf-source' && m === 'GET') {
    const r = await inc.getReport(env, seg[1]);
    if (!r) throw new HTTP(404, 'not found');
    const draft = 'history' in r ? inc.historyDraft(r.history) : r;
    return json({ draft, footer: `GearCast · ${draft.report_id ?? ''} · generated ${nowStr()}` });
  }
  if (seg[0] === 'incidents' && seg.length === 3 && seg[2] === 'pdf' && m === 'PUT') {
    const id = seg[1];
    if (!(await inc.getReport(env, id))) throw new HTTP(404, 'not found');
    if (await env.FILES.head(pdfKey(id))) return json({ ok: true, stored: false, note: 'already generated' });
    const data = new Uint8Array(await req.arrayBuffer());
    if (data.length > 8 * 1024 * 1024 || data.length < 5 || String.fromCharCode(...data.slice(0, 5)) !== '%PDF-') throw new HTTP(400, 'expected a PDF (max 8 MB)');
    await env.FILES.put(pdfKey(id), data, { httpMetadata: { contentType: 'application/pdf' } });
    return json({ ok: true, stored: true });
  }

  // PM task assignments (shared so technicians see the tasks the operator assigned to them)
  if (p === '/api/pm/assignments' && m === 'GET') {
    const v = await env.DB.prepare("SELECT v FROM kv WHERE k = 'pm_assign'").first<string>('v');
    return json({ assignments: v ? JSON.parse(v) : {} });
  }
  if (p === '/api/pm/assignments' && m === 'PUT') {
    const b = await body(req);
    if (!obj(b) || !obj(b.assignments)) throw bad('Field required', ['body', 'assignments']);
    const a: Record<string, string> = {};
    for (const [k, v] of Object.entries(b.assignments)) if (typeof v === 'string' && v) a[k] = v;
    await env.DB.prepare("INSERT INTO kv (k, v) VALUES ('pm_assign', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(a)).run();
    return json({ assignments: a });
  }

  // repair or replace
  if (p === '/api/rr/cases' && m === 'GET') return json({ model: rr.MODEL_INFO, cases: rr.cases() });
  if (seg[0] === 'rr' && seg[1] === 'predict' && seg.length === 3 && m === 'GET') {
    const rc = q.get('repair_cost_php');
    if (rc !== null && Number.isNaN(Number(rc))) throw bad('Input should be a valid number', ['query', 'repair_cost_php']);
    return json(tools.repairOrReplace(seg[2], null, rc === null || rc === '' ? null : Number(rc)));
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
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    const t0 = Date.now();
    const devAsOf = env.DEV_MODE === '1' ? req.headers.get('x-gearcast-as-of') : null;
    setContext(makeClock(devAsOf, Number(env.TZ_OFFSET_MIN || 480)));
    void D;
    try {
      if (!url.pathname.startsWith('/api/auth/') && url.pathname !== '/api/health') {
        const u = await sessionUser(req, env);
        if (!u) return json({ detail: 'Not signed in' }, 401);
        if (u.role === 'technician' && technicianBlocked(req.method, url.pathname)) return json({ detail: 'Operators only' }, 403);
      }
      return await route(req, env, ctx, url);
    } catch (e: any) {
      if (e instanceof HTTP) return json({ detail: e.detail }, e.status);
      console.log('error', url.pathname, e?.stack || String(e));
      return json({ detail: 'Internal Server Error' }, 500);
    } finally {
      if (env.DEV_MODE === '1') console.log(`${req.method} ${url.pathname} ${Date.now() - t0}ms`);
    }
  },
} satisfies ExportedHandler<Env>;

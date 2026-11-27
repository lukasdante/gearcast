// API smoke test of the story's state changes, per role, against the LOCAL capture server.
// It WRITES (approvals, access grant, assignment), so run video/capture/reset.sh afterwards (or pass --reset).
//   node video/capture/scripts/smoke.mjs [--png path/to/photo.png] [--reset]
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = `http://127.0.0.1:${process.env.CAPTURE_PORT || 8790}`;
if (!/^http:\/\/127\.0\.0\.1:/.test(BASE)) throw new Error('smoke test runs against the local capture server only');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const PW = { 'PS-01': 'ps-1', 'EN-01': 'engr-1', 'MT-01': 'tech-1', 'MT-02': 'tech-2', 'MT-03': 'tech-3' };
const jar = {};
async function as(u, path, init = {}) {
  if (!jar[u]) {
    const l = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: PW[u] }) });
    if (l.status !== 200) throw new Error(`login ${u} -> ${l.status}`);
    jar[u] = (l.headers.get('set-cookie') || '').split(';')[0];
  }
  const h = { cookie: jar[u], ...(init.json ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) };
  const r = await fetch(BASE + path, { method: init.method || 'GET', headers: h, body: init.json ? JSON.stringify(init.json) : init.body });
  return { s: r.status, b: await r.json().catch(() => null) };
}
let fail = 0;
const ok = (cond, msg, extra = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}${extra ? ' · ' + extra : ''}`); if (!cond) fail++; };

// login + me for every story account
for (const u of Object.keys(PW)) { const r = await as(u, '/api/auth/me'); ok(r.s === 200, `login ${u}`, `${r.b?.user?.role}`); }
ok((await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"username":"PS-01","password":"nope"}' })).status === 401, 'wrong password -> 401');

// start state
ok((await as('PS-01', '/api/approvals?status=pending')).b.approvals.length === 0, 'pending approvals empty at start');
ok(!(await as('MT-03', '/api/plants')).b.plants.some(p => p.id === 'plant-2'), 'MT-03 cannot see Plant 2 before the grant');
ok((await as('PS-01', '/api/plants')).b.plants.some(p => p.id === 'plant-2' && p.name === 'Plant 2'), 'PS-01 sees Plant 2 (manager)');
ok(Object.keys((await as('PS-01', '/api/pm/assignments')).b.assignments).length === 0, 'no PM assignments at start');

// RBAC: technician blocked actions
ok((await as('MT-01', '/api/pm/assignments', { method: 'PUT', json: { assignments: { 'PS-005': 'MT-02' } } })).s === 403, 'MT-01 cannot assign PM (403)');
ok((await as('MT-01', '/api/plants/access', { method: 'POST', json: { username: 'MT-03', plant_id: 'plant-2', hours: 12 } })).s === 403, 'MT-01 cannot grant access (403)');
ok((await as('EN-01', '/api/plants/access', { method: 'POST', json: { username: 'MT-03', plant_id: 'plant-2', hours: 12 } })).s === 403, 'EN-01 cannot grant access (403)');

// spares: grease (accessory) instant, bearing (major) -> approval
const g = await as('MT-01', '/api/approvals', { method: 'POST', json: { kind: 'spare_deploy', payload: { item_id: 'SPP-018', qty: 1, asset_id: 'M-101B', reason: 'Regrease M-101B bearings (P-101B vibration)' } } });
ok(g.b?.status === 'approved', 'MT-01 deploys SPP-018 grease -> approved at once', `${g.b?.id} ${g.b?.review_note}`);
const k = await as('MT-01', '/api/approvals', { method: 'POST', json: { kind: 'spare_deploy', payload: { item_id: 'SPP-003', qty: 1, asset_id: 'P-101B', reason: 'P-101B DE bearing replacement' } } });
ok(k.b?.status === 'pending' && k.b?.payload?.major, 'MT-01 deploys SPP-003 bearing -> pending (major)', k.b?.id);
const kr = await as('PS-01', `/api/approvals/${k.b.id}/review`, { method: 'POST', json: { decision: 'approve' } });
ok(kr.b?.status === 'approved', 'PS-01 approves the bearing', kr.b?.reviewed_by);

// PM: assign PS-005 (PM-02 weekly standby run test, P-101B) to MT-02; MT-02 files findings with a PNG photo; EN-01 approves
const pa = await as('PS-01', '/api/pm/assignments', { method: 'PUT', json: { assignments: { 'PS-005': 'MT-02' } } });
ok(pa.b?.assignments?.['PS-005'] === 'MT-02', 'PS-01 assigns PS-005 to MT-02');
const png = arg('--png') ? readFileSync(arg('--png')) : Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
const fd = new FormData();
fd.set('kind', 'pm_findings');
fd.set('payload', JSON.stringify({ status_id: 'PS-005', checklist: [{ item: 'Standby run 5 min', result: 'ok' }], readings: [{ label: 'Vibration DE', unit: 'mm/s', value: 1.5 }], findings: 'smoke test' }));
fd.set('photo1', new Blob([png], { type: 'image/png' }), 'photo.png');
const pf = await as('MT-02', '/api/approvals', { method: 'POST', body: fd });
ok(pf.b?.status === 'pending' && pf.b?.payload?.photos?.[0]?.type === 'image/png', 'MT-02 files PM findings with a PNG photo -> pending', `${pf.b?.id} ${pf.b?.title}`);
const pr = await as('EN-01', `/api/approvals/${pf.b.id}/review`, { method: 'POST', json: { decision: 'approve' } });
ok(pr.b?.status === 'approved', 'EN-01 approves the PM findings');

// layout: EN-01 proposes (pending), PS-01 approves (published)
const plants = (await as('EN-01', '/api/plants')).b.plants;
const doc = plants.find(p => p.id === 'default').doc;
const lc = await as('EN-01', '/api/approvals', { method: 'POST', json: { kind: 'layout_change', payload: { plant_id: 'default', note: 'smoke', doc: { ...doc, name: doc.name } } } });
ok(lc.b?.status === 'pending', 'EN-01 layout change -> pending', lc.b?.id);
ok((await as('EN-01', `/api/approvals/${lc.b.id}/review`, { method: 'POST', json: { decision: 'approve' } })).s === 403, 'EN-01 cannot approve a layout change (403)');
ok((await as('PS-01', `/api/approvals/${lc.b.id}/review`, { method: 'POST', json: { decision: 'approve' } })).b?.status === 'approved', 'PS-01 approves the layout change');

// emergency access: PS-01 grants MT-03 Plant 2 for 12 h
const gr = await as('PS-01', '/api/plants/access', { method: 'POST', json: { username: 'MT-03', plant_id: 'plant-2', hours: 12, reason: 'Short-handed night shift' } });
ok(!!gr.b?.expires_at, 'PS-01 grants MT-03 Plant 2 for 12 h', `expires ${gr.b?.expires_at}`);
ok((await as('MT-03', '/api/plants')).b.plants.some(p => p.id === 'plant-2' && p.access === 'temporary'), 'MT-03 now sees Plant 2 (temporary)');

// read paths used on camera
const kb = await as('EN-01', '/api/knowledge/search?q=' + encodeURIComponent('pump bearing replacement procedure') + '&k=5');
ok(kb.b?.results?.length > 0 && kb.b.results.some(r => r.dense > 0), 'knowledge search (BM25 + dense via Workers AI)', kb.b?.results?.map(r => `${r.source_type}:${r.source_id}${r.page ? ' p.' + r.page : ''}`).join(', '));
const rr = await as('EN-01', '/api/rr/predict/P-101B');
ok(!!rr.b?.replace_with?.supplier, 'RR P-101B', `${rr.b?.recommendation} · ${rr.b?.replace_with?.text}`);
const ir = await as('MT-01', '/api/incidents');
ok(ir.s === 200, 'incidents list', `${ir.b?.history?.length} history + ${ir.b?.submitted?.length} submitted`);

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed');
if (process.argv.includes('--reset')) execFileSync(new URL('../reset.sh', import.meta.url).pathname, ['--no-pdfs'], { stdio: 'inherit' });
else console.log('state was modified: run video/capture/reset.sh before a take');
process.exit(fail ? 1 : 0);

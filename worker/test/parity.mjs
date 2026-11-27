// Parity test: same requests against the Python backend (reference) and the Worker; JSON diffs per endpoint.
//   PY=http://127.0.0.1:8000 WK=http://127.0.0.1:8787 node test/parity.mjs [--verbose]
// The Worker must run with DEV_MODE=1 (wrangler dev reads .dev.vars) so it honours x-gearcast-as-of (the Python
// server's clock) and ?no_llm=1 for drafts. Drafts are compared against backend incidents.build_draft(use_llm=False)
// (run in a Python subprocess), so no LLM tokens are spent. LLM text fields are never compared.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PY = process.env.PY || 'http://127.0.0.1:8000';
const WK = process.env.WK || 'http://127.0.0.1:8787';
const VERBOSE = process.argv.includes('--verbose');
const ROOT = new URL('../../', import.meta.url).pathname;

const acct = Object.fromEntries(readFileSync(ROOT + '.accounts', 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => l.trim().split(/\s+/)).map(([u, , p]) => [u, p]));
const login = await fetch(WK + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'PS-01', password: acct['PS-01'] }) });
const COOKIE = (login.headers.get('set-cookie') || '').split(';')[0];
if (!login.ok) throw new Error('worker login failed');

let ASOF = null;
const call = async (base, method, path, body, asOf = ASOF) => {
  const headers = { 'content-type': 'application/json' };
  if (base === WK) { headers.cookie = COOKIE; if (asOf) headers['x-gearcast-as-of'] = asOf; }
  const r = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
};

// ---------------------------------------------------------------- diff
function diff(a, b, path = '', out = [], ignore = () => false) {
  if (ignore(path)) return out;
  if (typeof a === 'number' && typeof b === 'number') { if (!(a === b || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a)))) out.push(`${path}: ${a} != ${b}`); return out; }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') { if (a !== b) out.push(`${path}: ${JSON.stringify(a)?.slice(0, 160)} != ${JSON.stringify(b)?.slice(0, 160)}`); return out; }
  if (Array.isArray(a) !== Array.isArray(b)) { out.push(`${path}: type`); return out; }
  if (Array.isArray(a)) {
    if (a.length !== b.length) out.push(`${path}: length ${a.length} != ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) diff(a[i], b[i], `${path}[${i}]`, out, ignore);
    return out;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!(k in a) || !(k in b)) { if (!ignore(`${path}.${k}`)) out.push(`${path}.${k}: missing in ${k in a ? 'worker' : 'python'}`); continue; }
    diff(a[k], b[k], `${path}.${k}`, out, ignore);
  }
  return out;
}

const results = {};
const record = (group, label, d) => {
  const g = (results[group] ||= { cases: 0, diffs: 0, failing: [] });
  g.cases++; g.diffs += d.length;
  if (d.length) g.failing.push(`${label}: ${d.slice(0, VERBOSE ? 20 : 3).join(' | ')}${d.length > 3 && !VERBOSE ? ` (+${d.length - 3})` : ''}`);
};
async function same(group, label, method, path, body, ignore) {
  const [p, w] = [await call(PY, method, path, body), await call(WK, method, path, body)];
  const d = p.status !== w.status ? [`status ${p.status} != ${w.status}`] : diff(p.json, w.json, '', [], ignore);
  record(group, label, d);
  return [p.json, w.json];
}

// ---------------------------------------------------------------- clock: use the Python server's AS_OF
ASOF = (await call(PY, 'POST', '/api/tools/get_plant_status', {})).json.as_of;
console.log(`python as_of ${ASOF}`);

const ASSETS = ['P-101A', 'P-101B', 'M-101A', 'M-101B', 'P-201A', 'P-201B', 'SC-101A', 'SC-101B', 'VM-101A', 'VM-101B', 'SP-P01', 'SP-P02', 'SP-M01', 'SP-VM01'];
const SIMS = [
  null,
  { overrides: { 'P-101B': { current_status: 'Shut Down', status_since: '2026-11-19 08:00' } }, roleOverrides: {} },
  { overrides: { 'P-101A': { current_status: 'Shut Down' }, 'P-101B': { current_status: 'Under Maintenance' }, 'M-101A': { current_status: 'Shut Down' } },
    roleOverrides: { 'PR-SUMP': { duty_asset: 'P-201A', standby_asset: 'P-201B' } } },
  { overrides: { 'P-201A': { current_status: 'Shut Down' }, 'P-201B': { current_status: 'Shut Down' }, 'SC-101A': { current_status: 'Not Available' }, 'SC-101B': { current_status: 'Shut Down' } }, roleOverrides: {} },
];
const withSim = (b, s) => (s ? { ...b, sim: s } : b);
const txtIgnore = p => /\.text$/.test(p) || /\.(score|dense|bm25)$/.test(p);

// ---------------------------------------------------------------- tools
for (const [si, s] of SIMS.entries()) {
  await same('tools/get_plant_status', `sim${si}`, 'POST', '/api/tools/get_plant_status', withSim({}, s));
  await same('tools/list_alarms', `sim${si}`, 'POST', '/api/tools/list_alarms', withSim({}, s));
  for (const a of [...ASSETS, 'p-101a', 'X-999']) await same('tools/get_asset', `${a} sim${si}`, 'POST', '/api/tools/get_asset', withSim({ asset_id: a }, s));
  for (const b of [{}, { asset_id: 'P-101A' }, { asset_id: 'SC-101B', pair_down: true, outage_h: 12 }, { asset_id: 'P-201A', outage_h: 3 }, { asset_id: 'P-201B', outage_h: 7.5, pair_down: true },
    { asset_group_name: 'Screens', outage_h: 6 }, { asset_group_name: 'Sump pumps', outage_h: 3 }, { asset_group_name: 'Transfer pumps', outage_h: 24 }, { asset_id: 'VM-101A', outage_h: 4 }])
    await same('tools/loss_estimate', `${JSON.stringify(b)} sim${si}`, 'POST', '/api/tools/loss_estimate', withSim(b, s));
}
for (const b of [{}, { asset_id: 'P-101A', days: 30 }, { days: 60 }, { days: -5 }, { asset_id: 'SC-101A', days: 365 }, { asset_id: 'M-101B' }])
  await same('tools/pm_due', JSON.stringify(b), 'POST', '/api/tools/pm_due', b);
for (const b of [{}, { query: 'seal' }, { query: 'P-101A' }, { query: 'sp-p01' }, { below_min: true }, { query: 'bearing', below_min: true }, { query: 'Motor' }])
  await same('tools/spare_stock', JSON.stringify(b), 'POST', '/api/tools/spare_stock', b);
for (const a of [...ASSETS, 'nope']) await same('tools/failure_history', a, 'POST', '/api/tools/failure_history', { asset_id: a });
for (const b of [...ASSETS.map(a => ({ asset_id: a })), ...Array.from({ length: 11 }, (_, i) => ({ case_id: `rr-${String(i + 1).padStart(2, '0')}` })),
  { asset_id: 'P-101A', repair_cost_php: 300000 }, { asset_id: 'SC-101A', repair_cost_php: 5000 }, { case_id: 'RR-99' }, {}])
  await same('tools/repair_or_replace', JSON.stringify(b), 'POST', '/api/tools/repair_or_replace', b, k => k === '.replace_with');
await same('tools/unknown', 'x', 'POST', '/api/tools/nope', {});

// ---------------------------------------------------------------- rr
await same('rr/cases', 'all', 'GET', '/api/rr/cases');
for (const a of ASSETS) for (const q of ['', '?repair_cost_php=250000', '?repair_cost_php=0'])
  await same('rr/predict', a + q, 'GET', `/api/rr/predict/${a}${q}`, k => k === '.replace_with');

// ---------------------------------------------------------------- incidents list (+ get history record)
await same('incidents/list', 'all', 'GET', '/api/incidents');
for (const id of ['IR-2025-001', 'IR-2026-005', 'IR-2099-001']) await same('incidents/get', id, 'GET', `/api/incidents/${id}`);

// ---------------------------------------------------------------- knowledge search (ids; allow small rank noise)
const QUERIES = ['pump leaking at the seal', 'motor overheating smell', 'screen mesh torn', 'how to align the coupling', 'vibration high on P-101A',
  'check valve slamming', 'earth leakage breaker tripped', 'sump level high alarm', 'grease bearing interval', 'incident report severity definition',
  'LOTO isolation points', 'cavitation noise pressure fluctuating', 'replace mechanical seal procedure', 'P-201 submersible seal alarm'];
let kbExact = 0, kbSet = 0, kbN = 0, top1 = 0;
for (const q of QUERIES) for (const a of [null, 'P-201A']) {
  const path = `/api/knowledge/search?q=${encodeURIComponent(q)}&k=6${a ? `&asset_id=${a}` : ''}`;
  const [p, w] = [(await call(PY, 'GET', path)).json, (await call(WK, 'GET', path)).json];
  const pi = p.results.map(r => r.id), wi = w.results.map(r => r.id);
  kbN++; kbExact += JSON.stringify(pi) === JSON.stringify(wi); kbSet += pi.filter(x => wi.includes(x)).length / Math.max(1, pi.length); top1 += pi[0] === wi[0];
  const meta = diff(p.results.filter(r => wi.includes(r.id)).map(r => ({ ...r, text: 0, score: 0, dense: 0, bm25: 0 })).sort((x, y) => x.id < y.id ? -1 : 1),
    w.results.filter(r => pi.includes(r.id)).map(r => ({ ...r, text: 0, score: 0, dense: 0, bm25: 0 })).sort((x, y) => x.id < y.id ? -1 : 1));
  if (meta.length) record('knowledge/search meta', q, meta);
}
results['knowledge/search ranking'] = { cases: kbN, diffs: kbN - kbExact, failing: [`identical order ${kbExact}/${kbN}, same top-1 ${top1}/${kbN}, top-6 overlap ${(100 * kbSet / kbN).toFixed(1)}%`] };
await same('tools/search_knowledge', 'meta', 'POST', '/api/tools/search_knowledge', { query: 'pump leaking at the seal', asset_id: 'P-101A' }, p => txtIgnore(p) || /results/.test(p));

// ---------------------------------------------------------------- troubleshoot decision tree (fixed answers, no LLM)
const SYMS = Array.from({ length: 16 }, (_, i) => `SY-${String(i + 1).padStart(2, '0')}`);
for (const sid of SYMS) for (const policy of ['yes', 'no', 'alt']) for (const asset of [null, 'P-101A', 'SC-101B']) {
  const answers = [];
  for (let step = 0; step < 14; step++) {
    const b = { query: '', symptom_id: sid, asset_id: asset, answers, sim: SIMS[1] };
    const [p] = await same('troubleshoot', `${sid} ${policy} ${asset} step${step}`, 'POST', '/api/troubleshoot', b);
    if (!p || p.stage !== 'question') break;
    answers.push({ question_id: p.question.id, answer: policy === 'alt' ? (step % 2 ? 'no' : 'Yes') : policy });
  }
}
for (const sid of ['SY-03', 'SY-99']) await same('troubleshoot', `${sid} skip`, 'POST', '/api/troubleshoot', { query: 'x', symptom_id: sid, skip_questions: true });
await same('troubleshoot', 'empty query', 'POST', '/api/troubleshoot', { query: '  ' });

// ---------------------------------------------------------------- incident drafts (deterministic part; Python build_draft(use_llm=False))
const KEYS = ['asset_id', 'failure_at', 'reported_by', 'shift', 'detected_by', 'operating_condition', 'observed', 'actions_taken', 'downtime_h',
  'procedure_used', 'parts_used', 'spare_used', 'safety_injury', 'severity', 'shut_down'];
const full = b => { const o = Object.fromEntries(KEYS.map(k => [k, null])); Object.assign(o, b); o.shut_down = !!b.shut_down; if (o.downtime_h !== null) o.downtime_h = Number(o.downtime_h); return o; };
const DAY0 = ASOF.slice(0, 10);
const DRAFTS = [
  { body: { asset_id: 'P-101A', failure_at: `${DAY0} 06:40`, reported_by: 'MT-02', observed: 'Seal leaking, drips under pump', downtime_h: 5, procedure_used: 'EM-02', shut_down: true }, sim: SIMS[1] },
  { body: { asset_id: 'p-101b', observed: 'Loud grinding noise', procedure_used: 'PR-07 bearing', detected_by: 'Noise', severity: 'major' }, sim: null },
  { body: { asset_id: 'SC-101A', failure_at: `${DAY0} 15:10`, observed: 'Mesh torn', downtime_h: 2.5, parts_used: 'SPP-020 x1', safety_injury: 'near miss' }, sim: SIMS[3] },
  { body: { asset_id: 'P-201B', failure_at: '2026-10-28 23:30', observed: 'Seal alarm light on', operating_condition: 'Standby', shift: 'Night', procedure_used: 'EM-04' }, sim: SIMS[3] },
  { body: { asset_id: 'VM-101B', observed: 'Motor hot', downtime_h: 0 }, sim: SIMS[2] },
  { body: { asset_id: 'M-101A', failure_at: `${DAY0} 09:05`, observed: 'Tripped on overload', procedure_used: 'EM-07', downtime_h: 8, shut_down: true }, sim: SIMS[2] },
];
const pyDrafts = JSON.parse(execFileSync('uv', ['run', '--project', ROOT + 'backend', 'python', '-c', `
import json, sys
from gearcast_backend.data import AS_OF
from gearcast_backend import incidents
cases = json.load(sys.stdin)
def req(b):  # DraftReq coercion (downtime_h: float | None)
    b = dict(b); b["downtime_h"] = None if b["downtime_h"] is None else float(b["downtime_h"]); return b
print(json.dumps({"as_of": AS_OF, "out": [incidents.build_draft(req(c["body"]), c["sim"], use_llm=False) for c in cases]}, default=str))
`], { input: JSON.stringify(DRAFTS.map(d => ({ body: full(d.body), sim: d.sim && { overrides: d.sim.overrides, roleOverrides: d.sim.roleOverrides } }))), cwd: ROOT + 'backend', maxBuffer: 1 << 26 }).toString());
for (const [i, d] of DRAFTS.entries()) {
  const w = await call(WK, 'POST', '/api/incidents/draft?no_llm=1', { ...d.body, sim: d.sim }, pyDrafts.as_of);
  // field 2 is "now" (minute resolution) in both; everything else must match exactly.
  record('incidents/draft', `${d.body.asset_id}`, diff(pyDrafts.out[i], w.json, '', [], p => p === '.fields[1].value' || ['.tables.trends', '.trend', '.trend_indicators', '.inputs.trend', '.inputs.trend_days'].includes(p)));
}
const bad = [await call(PY, 'POST', '/api/incidents/draft', { asset_id: 'ZZ-1' }), await call(WK, 'POST', '/api/incidents/draft?no_llm=1', { asset_id: 'ZZ-1' })];
record('incidents/draft', 'unknown asset', diff(bad[0], bad[1]));

// ---------------------------------------------------------------- report
let total = 0;
console.log('\nendpoint'.padEnd(34) + 'cases  diffs');
for (const [k, v] of Object.entries(results)) {
  total += k === 'knowledge/search ranking' ? 0 : v.diffs;
  console.log(`${k.padEnd(33)} ${String(v.cases).padStart(5)}  ${String(v.diffs).padStart(5)}`);
  for (const f of v.failing.slice(0, VERBOSE ? 50 : 4)) console.log('    ' + f);
}
console.log(`\ntotal diffs (excluding search rank noise): ${total}`);
process.exit(total ? 1 : 0);

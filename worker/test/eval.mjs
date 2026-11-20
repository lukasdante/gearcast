// Troubleshoot retrieval eval against the Worker (same logic as backend/eval/troubleshoot_eval.py retrieval mode):
// hybrid search restricted to symptom chunks, k=3, over the 120 "Answer" symptomPhrases.
//   WK=http://127.0.0.1:8787 node test/eval.mjs
import { readFileSync } from 'node:fs';
const WK = process.env.WK || 'http://127.0.0.1:8787';
const ROOT = new URL('../../', import.meta.url).pathname;
const raw = JSON.parse(readFileSync(ROOT + 'ref/prototype_data_extracted.json', 'utf8'));
const phrases = raw.batch2.symptomPhrases.filter(p => p.expected_behaviour === 'Answer');
const firstProc = Object.fromEntries(raw.batch2.symptoms.map(s => [s.symptom_id, s.first_procedure]));
const acct = Object.fromEntries(readFileSync(ROOT + '.accounts', 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => l.trim().split(/\s+/)).map(([u, , p]) => [u, p]));
const login = await fetch(WK + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'OP-01', password: acct['OP-01'] }) });
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
let top1 = 0, top3 = 0, proc = 0;
const misses = [];
for (let i = 0; i < phrases.length; i += 8) {
  await Promise.all(phrases.slice(i, i + 8).map(async p => {
    const r = await (await fetch(`${WK}/api/knowledge/search?q=${encodeURIComponent(p.technician_phrase)}&k=3&source_types=symptom`, { headers: { cookie } })).json();
    const ids = r.results.map(h => h.source_id);
    top1 += ids[0] === p.expected_symptom_id; top3 += ids.includes(p.expected_symptom_id);
    proc += (ids.length ? firstProc[ids[0]] : null) === p.expected_first_step;
    if (ids[0] !== p.expected_symptom_id) misses.push([p.technician_phrase, p.expected_symptom_id, ids]);
  }));
}
const n = phrases.length, pc = x => (100 * x / n).toFixed(1) + '%';
console.log(`worker hybrid n=${n}  top-1 symptom ${pc(top1)}  top-3 symptom ${pc(top3)}  first-procedure ${pc(proc)}`);
if (process.argv.includes('--misses')) for (const m of misses) console.log('  ', JSON.stringify(m));

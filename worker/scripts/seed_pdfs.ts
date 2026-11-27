// Pre-generates the historical incident report PDFs with the shared renderer (worker/src/doc) and stores them through
// the API (PUT /api/incidents/{id}/pdf), so the first download is instant.
//   npx esbuild scripts/seed_pdfs.ts --bundle --platform=node --format=esm --outfile=.wrangler/seed_pdfs.mjs
//   node .wrangler/seed_pdfs.mjs https://gearcast.engrlouis.dev
import { readFileSync } from 'node:fs';
import { filledTree, loadTemplate } from '../src/doc/render';
import { docToPdf } from '../src/doc/pdf';

const base = process.argv[2] || 'http://127.0.0.1:8787';
const root = new URL('../../', import.meta.url).pathname;
const acct = Object.fromEntries(readFileSync(root + '.accounts', 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => l.trim().split(/\s+/)).map(([u, , p]) => [u, p]));
const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'PS-01', password: acct['PS-01'] }) });
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
const tpl = loadTemplate(readFileSync(root + 'app/public/forms/Incident_Report_Form_v1.2.docx'));
const fonts = { regular: readFileSync(root + 'app/public/forms/DejaVuSansCondensed.ttf'), bold: readFileSync(root + 'app/public/forms/DejaVuSansCondensed-Bold.ttf') };
const list: any = await (await fetch(base + '/api/incidents', { headers: { cookie } })).json();
let made = 0;
for (const r of [...list.history, ...list.submitted]) {
  const head = await fetch(`${base}/api/incidents/${r.report_id}/pdf`, { headers: { cookie } });
  if (head.status !== 409) continue;
  const { draft, footer }: any = await (await fetch(`${base}/api/incidents/${r.report_id}/pdf-source`, { headers: { cookie } })).json();
  const pdf = await docToPdf(filledTree(tpl, draft, { vectorCharts: true }), fonts, footer, true, { charts: draft.tables?.trends || [] });
  const put = await fetch(`${base}/api/incidents/${r.report_id}/pdf`, { method: 'PUT', headers: { cookie, 'content-type': 'application/pdf' }, body: pdf });
  if (put.ok) made++; else console.log(r.report_id, put.status, await put.text());
}
console.log(`stored ${made} PDFs`);

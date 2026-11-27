// Prints what the capture app ACTUALLY shows right now (run after reset.sh, before a take):
// the Supervisor dashboard's needs-attention ranking + reasons, condition watch, process strip, KPIs,
// plus API facts per role (plants/access, approvals, PM assignments, P-101B trend, RR replacement).
//   node video/capture/scripts/story_state.mjs [--base http://127.0.0.1:8790] [--shot out.png]
import { BASE as BASE0, ACCOUNTS, AS_OF, launch, newStoryContext, login } from '../lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', BASE0);
const SHOT = arg('--shot', null);
const PW = Object.fromEntries(Object.entries(ACCOUNTS).map(([u, a]) => [u, a.password]));
const H = AS_OF === 'live' ? {} : { 'x-gearcast-as-of': AS_OF };

async function api(user, path, init = {}) {
  const l = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: user, password: PW[user] }) });
  const cookie = (l.headers.get('set-cookie') || '').split(';')[0];
  const r = await fetch(BASE + path, { ...init, headers: { cookie, ...H, ...(init.headers || {}) } });
  return { status: r.status, body: await r.json().catch(() => null) };
}

const browser = await launch();
const ctx = await newStoryContext(browser, 'laptop');
const page = await ctx.newPage();
const t0 = Date.now();
await login(page, 'PS-01');
const tLogin = Date.now() - t0;
await page.locator('.dash-att').waitFor();
const dash = await page.evaluate(() => {
  const txt = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  return {
    attention_asset: txt(document.querySelector('.dash-att .insp-tag')),
    attention_pager: [...document.querySelectorAll('.dash-pager button')].map(txt),
    attention_reasons: [...document.querySelectorAll('.dash-reasons li')].map(txt),
    attention_chips: txt(document.querySelector('.dash-att .insp-title')),
    condition_watch: [...document.querySelectorAll('.dash-list')].filter(s => /Condition watch/.test(txt(s.querySelector('.dash-h'))))
      .flatMap(s => [...s.querySelectorAll('.dash-row')].map(txt)),
    process: [...document.querySelectorAll('.dp-node')].map(n => `${txt(n)} [${n.className.replace('dp-node', '').trim() || 'ok'}]`),
    kpis: [...document.querySelectorAll('.dash-kpi')].map(txt),
    calendar_month: txt(document.querySelector('.mini-cal-m')),
    today_cell: txt(document.querySelector('.mc-d.today')),
  };
});
if (SHOT) await page.screenshot({ path: SHOT });
await browser.close();

const out = { base: BASE, as_of: AS_OF, captured_at: new Date().toString(), login_to_dashboard_ms: tLogin, dashboard: dash };
out.plants_MT03 = (await api('MT-03', '/api/plants')).body?.plants?.map(p => `${p.id} (${p.access})`);
out.plants_PS01 = (await api('PS-01', '/api/plants')).body?.plants?.map(p => `${p.id} (${p.access})`);
out.access_grants = (await api('PS-01', '/api/plants/access')).body?.grants;
out.approvals = (await api('PS-01', '/api/approvals')).body?.approvals?.map(a => `${a.id} ${a.kind} ${a.status}`);
out.pm_assignments = (await api('PS-01', '/api/pm/assignments')).body?.assignments;
const tr = (await api('EN-01', '/api/incidents/trends?asset_id=P-101B&days=30')).body;
out.p101b_trend_30d = tr?.trends?.map(t => t.summary);
out.p101a_trend_30d = (await api('EN-01', '/api/incidents/trends?asset_id=P-101A&days=30')).body?.trends?.map(t => t.summary);
const rr = (await api('EN-01', '/api/rr/predict/P-101B')).body;
out.rr_P101B = rr && { recommendation: rr.recommendation, confidence: rr.confidence, replace_with: rr.replace_with?.text, fastest: rr.replace_with?.fastest_alternative };
console.log(JSON.stringify(out, null, 2));

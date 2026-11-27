// 02-a — Lemuel (PS-01) signs in → Dashboard: KPI row, process strip, needs-attention 3D card (P-101A) + condition watch.
import { openAs, startRec, settle, sleep, BASE, ACCOUNTS } from './cap.mjs';

export default async function shot(browser) {
  const { page } = await openAs(browser, 'PS-01', { login: false });
  await page.goto(BASE + '/');
  await page.locator('.login-card').waitFor();
  await settle(page, 800);

  const r = await startRec(page, '02-a');
  await r.pause(1800);
  r.mark('login-page');
  await r.click(page.getByRole('tab', { name: 'Supervisor' }), { label: 'Supervisor', ms: 800 });
  // the account select is native: pick by keyboard-free selectOption after a visible click on it
  const sel = page.locator('.login-card select');
  await r.move(sel, { label: 'Account PS-01', ms: 600 });
  await sel.selectOption('PS-01');
  await r.pause(300);
  await r.type(page.locator('.login-card input[type=password]'), ACCOUNTS['PS-01'].password, { label: 'password', delay: 40 });
  await r.pause(300);
  await r.click(page.locator('.login-card button[type=submit]'), { label: 'Sign in', ms: 600 });
  r.mark('sign-in');
  await page.locator('.app-main').waitFor({ timeout: 30000 });
  await page.locator('.splash').waitFor({ state: 'detached', timeout: 30000 });
  r.mark('dashboard-shown');
  await page.locator('.dash-3d canvas').waitFor();
  await settle(page, 1200);
  r.mark('dashboard-ready');
  await r.pause(800);
  // pan across the KPI row, then the process strip
  const kpis = page.locator('.dash-kpi');
  const n = await kpis.count();
  await r.hover(kpis.first(), { label: 'KPI row', ms: 900, dwell: 500 });
  await r.hover(kpis.nth(Math.floor(n / 2)), { label: 'PM KPIs', ms: 900, dwell: 500 });
  await r.hover(kpis.nth(n - 1), { label: 'KPI row end', ms: 900, dwell: 500 });
  r.mark('kpi-pan-done');
  await r.hover(page.locator('.dash-process'), { label: 'Process strip', ms: 900, dwell: 1200 });
  // "one pump already flagged": the needs-attention 3D card (P-101A)
  await r.hover(page.locator('.dash-3d'), { label: 'Needs attention · P-101A', ms: 1000, dwell: 1200 });
  r.mark('flagged-p101a');
  await r.hover(page.locator('.dash-att-info .insp-title'), { label: 'P-101A', ms: 600, dwell: 900 });
  const watchRow = page.locator('.dash-list .dash-row', { has: page.locator('.dash-tag', { hasText: /^P-101A$/ }) });
  await r.hover(watchRow, { label: 'Condition watch P-101A 1.6 mm/s', ms: 900, dwell: 2200 });
  r.mark('watch-p101a');
  await r.pause(1500);
  return r.finish();
}

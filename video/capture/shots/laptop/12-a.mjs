// 12-a — Lemuel (PS-01), Plant Overview → Plants menu → Plant access…: MT-03 → Plant 2, 8 hours (shift), reason →
// Give access → the access row appears ("until <expiry> · by PS-01"). The app offers 8 h / 24 h / 3 d / 7 d / assigned
// (no 12 h), so the shift option is used.
import { openAs, startRec, settle, BASE } from './cap.mjs';

export default async function shot(browser) {
  const { page } = await openAs(browser, 'PS-01');
  await page.goto(BASE + '/#/overview');
  await page.locator('.overview canvas').waitFor();
  await settle(page, 2500);

  const r = await startRec(page, '12-a');
  await r.pause(2000);
  await r.click(page.locator('.plants-menu > button'), { label: 'Plants', ms: 900 });
  await r.click(page.locator('.plants-menu .menu-new', { hasText: 'Plant access' }), { label: 'Plant access…', ms: 700 });
  const form = page.locator('.access-form');
  await form.waitFor();
  await settle(page, 300);
  r.mark('access-modal');
  const pickSel = async (labelText, value, label) => {
    const s = form.locator('label', { hasText: labelText }).locator('select');
    await r.click(s, { label, ms: 700, settle: 120 });
    await page.keyboard.press('Escape');
    await s.selectOption(value);
    await r.pause(450);
  };
  await pickSel('Person', 'MT-03', 'Person · MT-03 Technician');
  await pickSel('Plant', 'plant-2', 'Plant 2');
  await pickSel('Duration', '8', 'Duration · 8 hours (shift)');
  r.mark('expiry-picked');
  await r.type(form.locator('label', { hasText: 'Reason' }).locator('input'), 'Night shift cover – Plant 2 short a technician', { label: 'Reason' });
  await r.pause(300);
  await r.click(form.locator('button', { hasText: 'Give access' }), { label: 'Give access', ms: 700 });
  const row = page.locator('.access-row', { has: page.locator('b', { hasText: 'MT-03' }) });
  await row.waitFor({ timeout: 15000 });
  r.mark('access-granted');
  await r.hover(row, { label: 'MT-03 · Plant 2 · until expiry', ms: 800, dwell: 2500 });
  await r.pause(1200);
  return r.finish();
}

// 13-c — beauty: the one-tap approval (PS-01 approves bearing SPP-003 in Spare Readiness). ~3 s around the click;
// the editor overlays the ApprovalToast at mark "toast-approved". Prep = 06-b's prep (API).
import { openAs, startRec, settle, BASE } from './cap.mjs';
import { prep } from './06-b.mjs';

export default async function shot(browser) {
  const id = await prep();
  const { page } = await openAs(browser, 'PS-01');
  await page.goto(BASE + '/#/spares');
  const row = page.locator('.ap-row', { has: page.locator('.mono', { hasText: id }) });
  await row.waitFor();
  await page.evaluate(() => document.querySelector('.ap-queue')?.scrollIntoView({ block: 'center' }));
  await settle(page, 800);
  await page.mouse.move(960, 600);
  const r = await startRec(page, '13-c');
  await r.pause(400);
  await r.click(row.locator('button', { hasText: 'Approve' }), { label: 'Approve', ms: 700 });
  await row.waitFor({ state: 'detached', timeout: 10000 });
  r.mark('toast-approved');
  await r.pause(1500);
  return r.finish({ trim: { inSec: 0, outSec: r.t() } });
}

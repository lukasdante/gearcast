// 13-b — beauty: both transfer pumps red (P-101A + P-101B simulated faults), "Process stopped at W05" banner, camera
// slowly orbiting the red W05 area. ~4 s. The faults are set before recording (same clicks as 04-a, not recorded).
import { openAs, startRec, settle, sleep, BASE } from './cap.mjs';

export default async function shot(browser) {
  const { page } = await openAs(browser, 'EN-01');
  await page.goto(BASE + '/#/overview');
  await page.locator('.overview canvas').waitFor();
  await settle(page, 2500);
  const label = id => page.locator('.asset-label', { has: page.locator('span.mono', { hasText: new RegExp(`^${id}$`) }) });
  const lb = await label('P-101A').boundingBox();
  await page.mouse.click(lb.x + lb.width / 2, lb.y + lb.height + 14);
  await page.locator('.insp-actions button', { hasText: 'Simulate fault' }).click();
  await sleep(1500);
  await label('P-101B').click();
  await page.locator('.insp-tag', { hasText: 'P-101B' }).waitFor();
  await page.locator('.insp-actions button', { hasText: 'Simulate fault' }).click();
  await page.locator('.process-alert').waitFor();
  await page.keyboard.press('Escape'); // close the inspector: full-width red scene
  await sleep(2000);
  const r = await startRec(page, '13-b');
  r.mark('red-pumps');
  // slow orbit: drag on empty canvas
  const c = await page.locator('.overview canvas').boundingBox();
  const y = Math.round(c.y + c.height * 0.85), x0 = Math.round(c.x + c.width * 0.55);
  await page.mouse.move(x0, y);
  await page.mouse.down();
  for (let i = 1; i <= 120; i++) { await page.mouse.move(x0 - i * 1.6, y); await sleep(33); }
  await page.mouse.up();
  await r.pause(800);
  return r.finish({ trim: { inSec: 0.2, outSec: +(r.t() - 0.3).toFixed(2) } });
}

// 13-a — beauty: the all-green dashboard (PS-01), needs-attention 3D pump slowly rotating. ~4 s, no actions.
import { openAs, startRec, settle, BASE } from './cap.mjs';

export default async function shot(browser) {
  const { page } = await openAs(browser, 'PS-01');
  await page.goto(BASE + '/#/dashboard');
  await page.locator('.dash-3d canvas').waitFor();
  await settle(page, 2500);
  const r = await startRec(page, '13-a');
  r.mark('green-dashboard');
  await r.pause(4500);
  return r.finish({ trim: { inSec: 0.5, outSec: 4.5 } });
}

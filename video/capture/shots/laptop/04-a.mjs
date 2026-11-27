// 04-a (hero) — Jun (EN-01), Plant Overview 3D: fault P-101A (standby covers, PHP 0) → fault P-101B (both red, W05 down,
// W06–W08 affected, "Process stopped" banner) → Expected outage 10 h → PHP 5,907,405.
import { openAs, startRec, settle, sleep, BASE } from './cap.mjs';

export default async function shot(browser) {
  const { page } = await openAs(browser, 'EN-01');
  await page.goto(BASE + '/#/overview');
  await page.locator('.overview canvas').waitFor();
  await settle(page, 2500);
  const label = id => page.locator('.asset-label', { has: page.locator('span.mono', { hasText: new RegExp(`^${id}$`) }) });

  const r = await startRec(page, '04-a');
  await r.pause(2200);
  // pump mesh sits just below its (hidden) floating tag
  const lb = await label('P-101A').boundingBox();
  const pump = { x: Math.round(lb.x + lb.width / 2), y: Math.round(lb.y + lb.height + 14) };
  await r.click(pump, { label: 'P-101A', ms: 900 });
  const sim = page.locator('.insp-actions button', { hasText: 'Simulate fault' });
  await sim.waitFor();
  await page.locator('.insp-tag', { hasText: 'P-101A' }).waitFor();
  r.mark('inspector-p101a');
  await r.pause(1700); // camera fly-in settles
  await r.click(sim, { label: 'Simulate fault', ms: 800 });
  r.mark('p101a-red');
  await page.locator('.cost-box').waitFor({ timeout: 10000 }).catch(() => {});
  await r.pause(400);
  r.mark('standby-covers-php0');
  await r.hover(page.locator('.cost-total'), { label: 'Standby available – TOTAL PHP 0', dwell: 1400 });

  // P-101B: its tag is visible now that the camera is close
  const lbB = label('P-101B');
  await r.click(lbB, { label: 'P-101B', ms: 800, scroll: false });
  await page.locator('.insp-tag', { hasText: 'P-101B' }).waitFor();
  await r.pause(1300);
  await r.click(page.locator('.insp-actions button', { hasText: 'Simulate fault' }), { label: 'Simulate fault', ms: 800 });
  r.mark('both-red');
  await page.locator('.process-alert').waitFor({ timeout: 10000 });
  r.mark('w05-critical-banner');
  await r.hover(page.locator('.process-alert'), { label: 'Process stopped at W05', dwell: 1500, scroll: false });

  const hours = page.locator('.cost-hours input');
  await hours.waitFor();
  await r.move(page.locator('.cost-box.down, .cost-box').first(), { label: 'Shutdown cost', ms: 700 });
  await r.pause(500);
  await r.type(hours, '10', { label: 'Expected outage 10 h', selectAll: true, delay: 120 });
  await page.locator('.cost-total', { hasText: '5,907,405' }).waitFor({ timeout: 10000 });
  r.mark('cost-5.9M');
  await r.hover(page.locator('.cost-total'), { label: 'PHP 5,907,405', dwell: 2600 });
  await r.pause(1500);
  return r.finish();
}

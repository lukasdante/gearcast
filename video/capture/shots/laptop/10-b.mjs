// 10-b — Lemuel (PS-01) signs off Jun's layout change on Plant Overview: "Layout changes" queue (who, plant, note,
// what changed) → Preview in 3D (proposed pump appears, "Previewing AP-0001" banner) → Approve → layout published.
// Prep (not recorded): Jun's 10-a edit in a headless pass (EN-01) → pending layout_change.
import { startRec, sleep } from './cap.mjs';
import { junEdits, direct, openOverview } from './10-a.mjs';

const labelOf = (page, id) => page.locator('.asset-label', { has: page.locator('span.mono', { hasText: new RegExp(`^${id}$`) }) });

export default async function shot(browser) {
  const jun = await openOverview(browser, 'EN-01');
  await junEdits(jun, direct(jun));
  const id = (await jun.locator('.draft-banner b').first().innerText()).match(/AP-\d+/)[0];
  await jun.context().close();
  console.log(`  prep: ${id} pending (layout_change by EN-01)`);

  const page = await openOverview(browser, 'PS-01');
  const queue = page.locator('.ov-approvals');
  const row = queue.locator('.ap-row', { has: page.locator('.mono', { hasText: id }) });
  await row.waitFor();
  await row.locator('.lc-diff').waitFor({ timeout: 15000 });
  // frame the W05 pump area (same camera as 10-a), then close the inspector
  const lb = await labelOf(page, 'P-101A').boundingBox();
  await page.mouse.click(lb.x + lb.width / 2, lb.y + lb.height + 14);
  await page.locator('.insp-actions').waitFor();
  await sleep(2000);
  await page.keyboard.press('Escape');
  await sleep(800);

  const r = await startRec(page, '10-b');
  await r.pause(1800);
  await r.hover(row.locator('.ap-head b'), { label: `${id} layout change · EN-01`, ms: 900, dwell: 900 });
  r.mark('queue-layout-change');
  await r.hover(row.locator('.lc-diff'), { label: 'Added: End-suction pump', ms: 700, dwell: 1100 });
  await r.click(row.locator('button', { hasText: 'Preview in 3D' }), { label: 'Preview in 3D', ms: 700 });
  await page.locator('.preview-banner').waitFor();
  r.mark('preview-on');
  await sleep(600);
  const pump = labelOf(page, 'End-suction pump');
  if (await pump.isVisible()) await r.hover(pump, { label: 'Proposed pump', ms: 900, dwell: 1400, scroll: false });
  else await r.pause(1400);
  await r.click(row.locator('button', { hasText: 'Approve' }), { label: 'Approve', ms: 900 });
  r.marks.push({ t: r.events[r.events.length - 1].t, name: 'toast-approved', approval: id }); // at the Approve click
  await row.waitFor({ state: 'detached', timeout: 10000 });
  await page.locator('.preview-banner').waitFor({ state: 'detached', timeout: 10000 });
  await sleep(800);
  r.mark('layout-published');
  if (await pump.isVisible()) await r.hover(pump, { label: 'Published', ms: 900, dwell: 2000, scroll: false });
  else await r.pause(2000);
  await r.pause(1000);
  return r.finish();
}

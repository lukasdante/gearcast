// 05-b (tablet, MT-01 Mia): Troubleshoot → "P-101A vibration rising" on P-101A → symptom SY-01 → Skip to procedure →
// Materials needed (part, stock, location, supplier · lead) → EM-01 steps with manual page badges + Sources.
import { take } from './common.mjs';

export default () => take({ shot: '05-b', device: 'tablet', user: 'MT-01' }, async s => {
  const { page, tap, type, mark, sleep, cap, scrollTo } = s;
  await tap(page.locator('.sidebar .nav-item', { hasText: 'Troubleshoot' }), 'Troubleshoot');
  await page.locator('input[aria-label="Describe the problem"]').waitFor();
  mark('troubleshoot-page');
  await type(page.locator('input[aria-label="Describe the problem"]'), 'P-101A vibration rising');
  const sel = page.locator('select[aria-label="Asset"]');
  await tap(sel, 'Asset: P-101A', { settle: 0 });       // native picker is not drawn in the screencast; set the value directly
  await sel.selectOption('P-101A');
  await sleep(400);
  await tap(page.locator('.ts-search button[type=submit]'), 'Troubleshoot');
  mark('submitted');
  await page.locator('.symptom-card').waitFor({ timeout: 90000 });
  mark('symptom');
  await sleep(1500);
  const skip = page.getByRole('button', { name: 'Skip to procedure' });
  if (await skip.count()) {
    await tap(skip, 'Skip to procedure');
  }
  await page.locator('.ts-materials').waitFor({ timeout: 90000 });
  mark('procedure');
  await sleep(800);
  await scrollTo(null, page.locator('.caster-says', { hasText: "Here's the job" }), { offset: 20, ms: 1100, label: 'Procedure' });
  mark('steps-from-manuals');
  await sleep(1400);
  await scrollTo(null, page.locator('.ts-materials'), { offset: 16, ms: 900, label: 'Materials needed' });
  mark('materials');
  const tbl = await page.locator('.ts-materials').boundingBox();
  cap.events.push({ t: cap.t(), type: 'hover', x: Math.round(tbl.x + tbl.width / 2), y: Math.round(tbl.y + 40), label: 'Materials needed', box: { x: Math.round(tbl.x), y: Math.round(tbl.y), w: Math.round(tbl.width), h: Math.round(Math.min(tbl.height, 800 - tbl.y)) } });
  await sleep(3000);
  await scrollTo(null, page.locator('.proc .phase').first(), { offset: 16, ms: 1200, label: 'Steps' });
  mark('steps');
  await sleep(2000);
  const src = page.locator('.sources');
  if (await src.count()) { await scrollTo(null, src, { offset: 420, ms: 1400, label: 'Sources' }); mark('sources'); await sleep(1800); }
});

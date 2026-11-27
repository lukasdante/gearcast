// 10-a — Jun (EN-01) updates the pump area layout: Plant Overview → zoom to W05 (select P-101A) → Edit layout → add
// an end-suction pump on the W05 pad → "Submit for approval" (note) → banner "AP-000x pending — waiting for a Plant Supervisor".
import { openAs, startRec, settle, sleep, BASE } from './cap.mjs';

const labelOf = (page, id) => page.locator('.asset-label', { has: page.locator('span.mono', { hasText: new RegExp(`^${id}$`) }) });

/** Jun's edit; `r` = recorder, or a stand-in that just performs the actions (prep for 10-b). */
export async function junEdits(page, r) {
  const lb = await labelOf(page, 'P-101A').boundingBox();
  await r.click({ x: Math.round(lb.x + lb.width / 2), y: Math.round(lb.y + lb.height + 14) }, { label: 'P-101A', ms: 900 });
  await page.locator('.insp-actions').waitFor();
  await sleep(1800); // camera fly-in
  await page.keyboard.press('Escape'); // close the inspector so the toolbar shows
  await sleep(700);
  await r.click(page.locator('.ov-toolbar button', { hasText: 'Edit layout' }), { label: 'Edit layout', ms: 800 });
  await page.locator('.palette').waitFor();
  await sleep(900);
  r.mark?.('edit-mode');
  // add a third (spare-position) end-suction pump on the W05 pad, in the free corner right of P-101B
  await r.click(page.locator('.palette button.kind[title="End-suction pump"]'), { label: 'End-suction pump', ms: 900 });
  await sleep(400);
  const bb = await labelOf(page, 'P-101B').boundingBox();
  const spot = { x: Math.round(bb.x + bb.width / 2 + 250), y: Math.round(bb.y + 215) };
  await r.click(spot, { label: 'Place pump on W05 pad', ms: 900 });
  await sleep(500);
  await page.keyboard.press('Escape'); // back to the select tool
  await sleep(700);
  r.mark?.('item-added');
  await r.click(page.locator('.ov-toolbar button', { hasText: 'Done editing' }), { label: 'Done editing', ms: 800 });
  const submit = page.locator('.draft-banner button', { hasText: 'Submit for approval' });
  await submit.waitFor();
  await sleep(600);
  await r.click(submit, { label: 'Submit for approval', ms: 800 });
  const note = page.locator('.modal input, .modal textarea').first();
  await note.waitFor();
  await r.type(note, 'Added standby pump position on the W05 pad', { label: 'What changed?' });
  await sleep(300);
  await r.click(page.locator('.modal button', { hasText: /^Submit$/ }), { label: 'Submit', ms: 700 });
  await page.locator('.draft-banner', { hasText: 'pending' }).waitFor({ timeout: 15000 });
  r.mark?.('sent-to-supervisor');
}

/** headless stand-in for prep passes (same actions, nothing logged) */
export const direct = page => ({
  async click(t, o = {}) { if (typeof t.click === 'function') await t.click(); else await page.mouse.click(t.x, t.y); await sleep(o.settle ?? 300); },
  async drag(a, b) { await page.mouse.move(a.x, a.y); await page.mouse.down(); for (let i = 1; i <= 20; i++) { await page.mouse.move(a.x + (b.x - a.x) * i / 20, a.y + (b.y - a.y) * i / 20); await sleep(30); } await page.mouse.up(); },
  async type(t, text) { await t.click(); await page.keyboard.type(text, { delay: 30 }); },
});

export async function openOverview(browser, user) {
  const { page } = await openAs(browser, user);
  await page.goto(BASE + '/#/overview');
  await page.locator('.overview canvas').waitFor();
  await settle(page, 2500);
  return page;
}

export default async function shot(browser) {
  const page = await openOverview(browser, 'EN-01');
  const r = await startRec(page, '10-a');
  await r.pause(2000);
  await junEdits(page, r);
  await r.hover(page.locator('.draft-banner'), { label: 'Sent to supervisor', ms: 800, dwell: 2200 });
  await r.pause(1000);
  return r.finish();
}

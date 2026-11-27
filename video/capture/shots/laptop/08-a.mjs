// 08-a — Jun (EN-01), Repair / Replace: check P-101A now → verdict card (model) → "If replaced": brand → supplier → lead time.
import { openAs, startRec, settle, BASE } from './cap.mjs';

/** bounding box (viewport px) of the first text match inside `loc` */
async function textBox(loc, needle) {
  return loc.evaluate((el, n) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      const i = t.textContent.indexOf(n);
      if (i < 0) continue;
      const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + n.length);
      const b = r.getBoundingClientRect();
      return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), box: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } };
    }
    return null;
  }, needle);
}

export default async function shot(browser) {
  const { page } = await openAs(browser, 'EN-01');
  await page.goto(BASE + '/#/rr');
  const live = page.locator('.rr-live');
  await live.waitFor();
  await settle(page, 1000);

  const r = await startRec(page, '08-a');
  await r.pause(2000);
  const sel = live.locator('select');
  await r.click(sel, { label: 'Asset select', ms: 900, settle: 150 });
  await page.keyboard.press('Escape');
  await sel.selectOption('P-101A');
  r.mark('p101a-selected');
  await r.pause(400);
  const quote = live.locator('input[type=number]');
  if (await quote.isVisible()) { await r.type(quote, '48000', { label: 'Repair quote PHP 48,000', delay: 60 }); r.mark('repair-quote'); await r.pause(300); }
  await r.click(live.locator('button', { hasText: /Run model|View/ }), { label: 'Run model', ms: 700 });
  const drawer = page.locator('.rr-drawer.open');
  const verdict = drawer.locator('.rr-verdict');
  await verdict.waitFor({ timeout: 30000 });
  await drawer.locator('.sym-head', { hasText: 'P-101A' }).waitFor();
  r.mark('verdict');
  await r.pause(600);
  await r.hover(verdict, { label: `Verdict · ${(await verdict.locator('b').first().innerText()).trim()}`, ms: 800, dwell: 1600, scroll: false });
  const strip = page.locator('.model-strip');
  if (await strip.isVisible()) { await r.hover(strip.locator('b').first(), { label: 'Model', ms: 800, dwell: 1000 }); r.mark('model-name'); }

  const rw = drawer.locator('.rr-replace-with');
  await rw.scrollIntoViewIfNeeded();
  await r.hover(rw.locator('span.muted').first(), { label: 'If replaced', ms: 800, dwell: 700, scroll: false });
  r.mark('if-replaced');
  await r.hover(rw.locator('div').first().locator('b'), { label: 'Brand', ms: 600, dwell: 900, scroll: false });
  r.mark('brand');
  await r.hover(rw.locator('div.small').first().locator('b').first(), { label: 'Supplier', ms: 600, dwell: 900, scroll: false });
  r.mark('supplier');
  const lt = await textBox(rw.locator('div.small').first(), 'lead time');
  if (lt) {
    const start = await textBox(rw.locator('div.small').first(), '~');
    const box = start ? { x: start.box.x, y: lt.box.y, w: lt.box.x + lt.box.w - start.box.x, h: lt.box.h } : lt.box;
    await r.hover({ x: Math.round(box.x + box.w / 2), y: lt.y }, { label: 'Lead time', ms: 600, dwell: 1600 });
    r.events[r.events.length - 1].box = box;
    r.mark('lead-time');
  }
  await r.pause(1500);
  return r.finish();
}

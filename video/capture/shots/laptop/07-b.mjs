// 07-b — the submitted incident report (Mia's, P-101A): Photo 1 beside the summary → Field 3 "Readings before the
// failure" 1 week → 1 month → 1 year (failure-date marker) → quick flash of the stored PDF.
// Prep (browser pass as MT-01, not recorded): Incidents → New incident (P-101A, observed notes, Photo 1 =
// worn-bearing.png) → Generate draft (Caster) → Submit report.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openAs, startRec, settle, illustration, sleep, BASE } from './cap.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function prep(browser) {
  const { context, page } = await openAs(browser, 'MT-01');
  await page.goto(BASE + '/#/incidents');
  await page.locator('button', { hasText: 'New incident' }).click();
  const form = page.locator('form.ir-form');
  await form.locator('label', { hasText: 'Asset' }).locator('select').selectOption('P-101A');
  await form.locator('label', { hasText: 'How detected' }).locator('select').selectOption('Rounds reading');
  await form.locator('label', { hasText: 'Operating condition' }).locator('select').selectOption('Standby');
  await form.locator('label', { hasText: 'What was observed' }).locator('textarea').fill(
    'Standby run test: P-101A drive-end bearing noisy and running hot, vibration DE 1.6 mm/s and rising over 30 days. Grease discoloured, visible wear on the bearing outer race.');
  await form.locator('label', { hasText: 'Actions taken' }).locator('textarea').fill('13:40 stopped run test, P-101B stays on duty; 13:50 LOTO on P-101A; requested DE bearing SPP-003.');
  await form.locator('label', { hasText: 'Procedure used' }).locator('input').fill('PR-06');
  await form.locator('.ir-photo-add input[type=file]').setInputFiles(illustration('worn-bearing.png'));
  await form.locator('.ir-photo img').waitFor();
  await form.locator('input[aria-label="Caption for photo 1"]').fill('Worn DE bearing, P-101A');
  await form.locator('button[type=submit]').click();
  await page.locator('.ir-draft').waitFor({ timeout: 120000 });
  await page.locator('.ir-draft button', { hasText: 'Submit report' }).click();
  await page.locator('.alert-box.ok').waitFor({ timeout: 60000 });
  await settle(page, 1000);
  const id = (await page.locator('.alert-box.ok').innerText()).match(/[A-Z]+-[\w-]+/)?.[0];
  await context.close();
  console.log(`  prep: submitted incident ${id}`);
}

export default async function shot(browser) {
  await prep(browser);
  const { page } = await openAs(browser, 'MT-01');
  await page.goto(BASE + '/#/incidents');
  const row = page.locator('.ir-table tbody tr', { has: page.locator('.badge.new') }).first();
  await row.waitFor();
  await settle(page, 1000);

  const r = await startRec(page, '07-b');
  await r.pause(2000);
  await r.click(row.locator('td').nth(2), { label: 'New report · P-101A', ms: 900 });
  const drawer = page.locator('.rr-drawer.open');
  const photo = drawer.locator('.ir-summary-photo img');
  await photo.waitFor();
  await page.waitForFunction(el => el.complete && el.naturalWidth > 0, await photo.elementHandle());
  await r.pause(700);
  r.mark('photo-beside-summary');
  await r.hover(drawer.locator('.ir-summary'), { label: 'Summary', ms: 800, dwell: 900, scroll: false });
  await r.hover(photo, { label: 'Photo 1', ms: 700, dwell: 1400, scroll: false });

  const trend = drawer.locator('.ir-report-trend');
  await trend.locator('.ir-chart-svg svg').first().waitFor({ timeout: 30000 });
  // Field 3 already sits under the summary in the drawer (no scroll needed)
  await r.hover(trend.locator('h4'), { label: 'Field 3 · Readings before the failure', ms: 800, dwell: 600, scroll: false });
  r.mark('field3');
  const range = label => trend.locator('.ir-trend-range button', { hasText: label });
  const pick = async (label, mark) => {
    await r.click(range(label), { label, ms: 700 });
    await page.waitForFunction(l => { const b = [...document.querySelectorAll('.rr-drawer.open .ir-trend-range button')].find(x => x.textContent === l); return b && b.classList.contains('primary') && !b.disabled; }, label, { timeout: 30000 });
    r.mark(mark);
    await r.pause(1000);
  };
  await pick('1 week', 'range-1w');
  await pick('1 month', 'range-1m');
  await pick('1 year', 'range-1y');
  // the failure marker: the vertical red line (x1 == x2) of the first chart
  const fm = await trend.locator('.ir-chart-svg').first().evaluate(el => {
    const l = [...el.querySelectorAll('line[stroke="#c0392b"]')].find(x => x.getAttribute('x1') === x.getAttribute('x2') && !x.getAttribute('stroke-dasharray'));
    if (!l) return null;
    const b = l.getBoundingClientRect();
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), box: { x: Math.round(b.x - 6), y: Math.round(b.y - 12), w: Math.round(b.width + 12), h: Math.round(b.height + 12) } };
  });
  r.mark('failure-marker');
  if (fm) { await r.hover({ x: fm.x, y: fm.y }, { label: 'Failure date', ms: 800, dwell: 2000 }); r.events[r.events.length - 1].box = fm.box; }
  else await r.pause(2000);

  // quick PDF flash: the stored report PDF in Chromium's viewer, then back
  const id = (await drawer.locator('.sym-id').innerText()).trim();
  const dlP = page.waitForEvent('download', { timeout: 60000 });
  await r.click(drawer.locator('button', { hasText: 'Download PDF' }), { label: 'Download PDF', ms: 700, settle: 100 });
  const dl = await dlP;
  const pdf = path.join(here, '.tmp-pdf', `${id}.pdf`);
  fs.mkdirSync(path.dirname(pdf), { recursive: true });
  await dl.saveAs(pdf);
  r.mark('pdf-downloaded');
  await sleep(400);
  await page.goto(pathToFileURL(pdf).href + '#view=FitH');
  await sleep(2500);
  r.mark('pdf-open');
  await r.pause(2500);
  return r.finish();
}

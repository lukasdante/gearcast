// 09-a — Jun (EN-01), Knowledge base: search → open the manual hit (WWTP Maintenance Manual p.17, PR-06 Bearing
// replacement) → the PDF opens at that page in Chromium's viewer. No upload (the cursor only brushes past it).
// Query: "pump bearing replacement procedure" — the storyboard's "bearing replacement transfer pump" ranks the generic
// p.13 "The pump and its parts" first; this one puts PR-06 / manual p.17 (the bearing procedure) at the top.
import { openAs, startRec, settle, sleep, BASE } from './cap.mjs';

const Q = process.env.KB_QUERY || 'pump bearing replacement procedure';

export default async function shot(browser) {
  const { page } = await openAs(browser, 'EN-01');
  await page.goto(BASE + '/#/knowledge');
  const input = page.locator('form.kb-search input');
  await input.waitFor();
  await settle(page, 1000);

  const r = await startRec(page, '09-a');
  await r.pause(2000);
  const up = page.locator('.kb-upload .kb-drop');
  if (await up.isVisible()) await r.move(up, { label: 'Upload (not used)', ms: 900 });
  await r.type(input, Q, { label: Q, ms: 800 });
  await r.pause(300);
  await r.click(page.locator('form.kb-search button[type=submit]'), { label: 'Search', ms: 600 });
  await page.locator('.hit').first().waitFor({ timeout: 30000 });
  r.mark('results');
  await r.pause(900);
  // first hit that opens the manual at a page
  const openP = /Open p\.\d+/;
  const hit = page.locator('.hit', { has: page.locator('.kb-hit-actions a', { hasText: openP }) }).first();
  const link = hit.locator('.kb-hit-actions a', { hasText: openP });
  await r.hover(hit.locator('.hit-head b'), { label: (await hit.locator('.hit-head b').innerText()).trim(), ms: 800, dwell: 900 });
  const href = await link.getAttribute('href');
  await link.evaluate(a => a.removeAttribute('target')); // open in this tab so the recording keeps it
  await r.click(link, { label: (await link.innerText()).trim(), ms: 600, settle: 100 });
  await page.waitForURL(u => u.href.includes('.pdf'), { timeout: 20000 }).catch(() => page.goto(new URL(href, BASE).href));
  await sleep(3000);
  r.mark('manual-page');
  await r.pause(3000);
  return r.finish();
}

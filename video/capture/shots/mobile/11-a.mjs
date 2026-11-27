// 11-a (tablet, MT-02 Ken): My tasks → PS-024 (PM-09 shaft alignment & coupling check, P-101A) → Record findings →
// checklist, Vibration DE reading, photos pm-findings-1/2.png, findings note, (inset: scanned job-sheet.png tab), File findings.
// Setup (unrecorded): PS-01 assigns PS-024 to MT-02 through the API.
import path from 'node:path';
import { take, apiLogin, ILLU } from './common.mjs';
import { BASE, AS_OF } from '../../lib.mjs';

async function assign() {
  const cookie = await apiLogin('PS-01');
  const h = { cookie, 'x-gearcast-as-of': AS_OF, 'content-type': 'application/json' };
  const cur = (await (await fetch(`${BASE}/api/pm/assignments`, { headers: h })).json()).assignments || {};
  const r = await fetch(`${BASE}/api/pm/assignments`, { method: 'PUT', headers: h, body: JSON.stringify({ assignments: { ...cur, 'PS-024': 'MT-02' } }) });
  if (!r.ok) throw new Error(`assign PS-024: ${r.status}`);
  console.log('  setup: PS-024 → MT-02', (await (await fetch(`${BASE}/api/pm/assignments`, { headers: h })).json()).assignments);
}

export default async () => {
  await assign();
  return take({ shot: '11-a', device: 'tablet', user: 'MT-02' }, async s => {
    const { page, tap, type, mark, sleep, scrollTo } = s;
    // capture-only workaround (app bug): in the findings modal .pmf-checks flex-shrinks to 0 px at 1280x800, hiding the checklist
    await page.addStyleTag({ content: '.pmf-checks{flex-shrink:0}' });
    await tap(page.locator('.sidebar .nav-item', { hasText: 'My tasks' }), 'My tasks');
    const row = page.locator('.data-table tbody tr', { hasText: 'PM-09' }).filter({ hasText: 'P-101A' });
    await row.waitFor();
    mark('my-tasks');
    console.log('  my tasks rows:', await page.locator('.data-table tbody tr').count());
    await sleep(900);
    await tap(row.getByRole('button', { name: 'Record findings' }), 'Record findings');
    const modal = page.locator('.modal');
    await modal.locator('.pmf-checks').waitFor();
    mark('findings-form');
    await sleep(900);
    // checklist: rows default to OK — tap through the first few, then "All OK"
    const okBtns = modal.locator('.pmf-check .pmf-res button', { hasText: /^OK$/ });
    const n = Math.min(3, await okBtns.count());
    for (let i = 0; i < n; i++) await tap(okBtns.nth(i), `Check ${i + 1} OK`, { before: 380, settle: 120 });
    await tap(modal.getByRole('button', { name: 'All OK' }), 'All OK', { before: 450 });
    mark('checklist');
    const vib = modal.locator('.pmf-reads-grid label', { hasText: 'Vibration DE' }).locator('input');
    await scrollTo('.modal-body', modal.locator('.pmf-reads'), { offset: 10, ms: 800, label: 'Readings' });
    await type(vib, '1.4', 'Vibration DE 1.4');
    mark('reading');
    await scrollTo('.modal-body', modal.locator('.pmf-photos'), { offset: 10, ms: 600, label: 'Photos' });
    const fc = page.waitForEvent('filechooser');
    await tap(modal.locator('.pmf-photo-add'), 'Take / add photo');
    await (await fc).setFiles([path.join(ILLU, 'pm-findings-1.png'), path.join(ILLU, 'pm-findings-2.png')]);
    await modal.locator('.pmf-photo img').nth(1).waitFor({ timeout: 60000 });
    mark('photos');
    await sleep(1200);
    const notes = modal.locator('label', { hasText: /^Findings/ }).locator('textarea');
    await scrollTo('.modal-body', notes, { offset: 120, ms: 600, label: 'Findings' });
    await type(notes, 'Alignment within 0.05 mm, coupling insert OK. No abnormal findings.', 'Findings');
    mark('findings-text');
    await sleep(800);
    // optional inset: the paper route — scanned job sheet
    await scrollTo('.modal-body', modal.locator('[role=tablist]'), { offset: 10, ms: 700, label: 'How to file' });
    await tap(modal.getByRole('tab', { name: 'Upload scanned job sheet' }), 'Upload scanned job sheet');
    mark('inset-scan-start');
    const fc2 = page.waitForEvent('filechooser');
    await tap(modal.locator('.pmf-scan'), 'Scan job sheet');
    await (await fc2).setFiles(path.join(ILLU, 'job-sheet.png'));
    await modal.locator('.pmf-scan b', { hasText: 'job-sheet.png' }).waitFor();
    mark('inset-scan-attached');
    await sleep(1500);
    await tap(modal.getByRole('tab', { name: 'Fill in on tablet' }), 'Fill in on tablet');
    mark('inset-scan-end');
    await sleep(700);
    await tap(modal.getByRole('button', { name: 'File findings' }), 'File findings');
    await modal.waitFor({ state: 'detached', timeout: 60000 });
    mark('filed');
    await page.locator('.ap-row', { hasText: 'P-101A' }).first().waitFor();
    await scrollTo(null, page.locator('.ap-row').first(), { offset: 140, ms: 800, label: 'My PM findings' });
    mark('pending-approval');
    console.log('  queue:', (await page.locator('.ap-row').first().innerText()).replace(/\n+/g, ' | ').slice(0, 300));
    await sleep(2200);
  });
};

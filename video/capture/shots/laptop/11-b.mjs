// 11-b — Jun (EN-01), PM Monitoring → "PM findings to approve": Ken's PS-024 findings (P-101A alignment & coupling,
// readings + 2 photo thumbs) → Approve → the PM table row: Last done flips to today, badge "Approved".
// Prep (API, not recorded): PS-01 assigns PS-024 to MT-02; MT-02 files findings with pm-findings-1/2.png (re-encoded to
// JPEG ≤1600 px like the app does).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openAs, startRec, settle, api, illustration, BASE, OUT } from './cap.mjs';

const jpeg = src => {
  const out = path.join(OUT, `.tmp-11b-${path.basename(src, '.png')}.jpg`);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vf', "scale='min(1600,iw)':-2", '-q:v', '3', out]);
  const b = fs.readFileSync(out); fs.rmSync(out); return b;
};

export async function prep() {
  await api('PS-01', '/api/pm/assignments', { method: 'PUT', json: { assignments: { 'PS-024': 'MT-02' } } });
  const fd = new FormData();
  fd.set('kind', 'pm_findings');
  fd.set('payload', JSON.stringify({
    status_id: 'PS-024', task_id: 'PM-09', asset_id: 'P-101A', done_at: '2026-11-28 13:20', mode: 'form', hours: 2,
    checklist: [
      { item: 'PR-15 1. Pump isolated, LOTO applied and verified', result: 'ok', note: '' },
      { item: 'PR-15 4. Coupling gap within tolerance', result: 'ok', note: '' },
      { item: 'PR-15 6. Angular / parallel misalignment ≤ 0.05 mm after correction', result: 'ok', note: '0.03 mm' },
      { item: 'PR-14 3. Coupling insert free of cracks and wear', result: 'ok', note: 'new insert SPP-009 fitted' },
      { item: 'Unit returned to service / standby', result: 'ok', note: '' },
    ],
    readings: [
      { label: 'Vibration DE', unit: 'mm/s', value: 1.2 },
      { label: 'Vibration NDE', unit: 'mm/s', value: 1.0 },
      { label: 'Bearing temperature', unit: '°C', value: 52 },
    ],
    photo_captions: ['Dial-indicator alignment check', 'Coupling after re-alignment'],
    measurements: 'Parallel offset 0.03 mm, angular 0.02 mm/100 mm after shimming',
    findings: 'Coupling misaligned 0.18 mm at start; re-shimmed motor feet and re-aligned. Vibration back to 1.2 mm/s DE.',
    parts_used: 'SPP-009 coupling insert', followup: false, followup_note: '',
  }));
  fd.set('photo1', new Blob([jpeg(illustration('pm-findings-1.png'))], { type: 'image/jpeg' }), 'photo1.jpg');
  fd.set('photo2', new Blob([jpeg(illustration('pm-findings-2.png'))], { type: 'image/jpeg' }), 'photo2.jpg');
  const a = await api('MT-02', '/api/approvals', { method: 'POST', body: fd });
  if (a.status !== 'pending') throw new Error('findings not pending');
  return a.id;
}

export default async function shot(browser) {
  const id = await prep();
  const { page } = await openAs(browser, 'EN-01');
  await page.goto(BASE + '/#/pm');
  const row = page.locator('.ap-row', { has: page.locator('.mono', { hasText: id }) });
  await row.waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.ap-photos img')].every(i => i.complete && i.naturalWidth > 0) && document.querySelectorAll('.ap-photos img').length >= 2, null, { timeout: 15000 });
  await settle(page, 600);
  await page.evaluate(() => document.querySelector('.ap-queue')?.scrollIntoView({ block: 'start' }));
  await settle(page, 400);

  const r = await startRec(page, '11-b');
  await r.pause(2000);
  await r.hover(row.locator('.ap-head b'), { label: 'PM-09 P-101A findings · MT-02', ms: 900, dwell: 700 });
  await r.hover(row.locator('.ap-reads'), { label: 'Readings', ms: 700, dwell: 900 });
  await r.hover(row.locator('.ap-photos'), { label: 'Photos', ms: 700, dwell: 1000 });
  r.mark('findings-with-photos');
  await r.click(row.locator('button', { hasText: 'Approve' }), { label: 'Approve', ms: 700 });
  await row.waitFor({ state: 'detached', timeout: 10000 });
  r.mark('toast-approved');
  await r.pause(800);
  // "record updates itself": the PM table row
  await r.type(page.locator('input[aria-label="Search PM tasks"]'), 'PM-09', { label: 'Search PM-09' });
  const pmRow = page.locator('.data-table tbody tr', { has: page.locator('button.link', { hasText: /^P-101A$/ }) }).filter({ hasText: 'PM-09' });
  await pmRow.waitFor();
  await r.pause(500);
  const lastDone = pmRow.locator('td').nth(4);
  await r.hover(lastDone, { label: `Last done ${(await lastDone.innerText()).trim()}`, ms: 800, dwell: 1200 });
  r.mark('last-done-today');
  await r.hover(pmRow.locator('.badge.ap-approved'), { label: 'Approved', ms: 700, dwell: 1600 });
  await r.pause(1200);
  return r.finish();
}

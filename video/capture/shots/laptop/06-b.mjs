// 06-b — Lemuel (PS-01) approves Mia's bearing SPP-003 deployment in Spare Readiness → "Spare deployments".
// Prep (API, not recorded): MT-01 deploys grease SPP-018 (accessory, approved at once) and requests SPP-003 (major → pending).
import { openAs, startRec, settle, api, BASE } from './cap.mjs';

export async function prep() {
  await api('MT-01', '/api/approvals', { method: 'POST', json: { kind: 'spare_deploy', payload: { item_id: 'SPP-018', qty: 1, asset_id: 'M-101A', reason: 'Regrease M-101A motor bearings (P-101A vibration rising)' } } });
  const k = await api('MT-01', '/api/approvals', { method: 'POST', json: { kind: 'spare_deploy', payload: { item_id: 'SPP-003', qty: 1, asset_id: 'P-101A', reason: 'P-101A drive-end bearing replacement (vibration 1.3 → 1.6 mm/s)' } } });
  if (k.status !== 'pending') throw new Error('SPP-003 not pending: ' + k.status);
  return k.id;
}

export default async function shot(browser) {
  const id = await prep();
  const { page } = await openAs(browser, 'PS-01');
  await page.goto(BASE + '/#/spares');
  const row = page.locator('.ap-row', { has: page.locator('.mono', { hasText: id }) });
  await row.waitFor();
  await settle(page, 800);
  // queue in view before recording (it sits under the spares table)
  await row.scrollIntoViewIfNeeded();
  await page.evaluate(() => { const q = document.querySelector('.ap-queue'); q && q.scrollIntoView({ block: 'center' }); });
  await settle(page, 500);

  const r = await startRec(page, '06-b');
  await r.pause(2000);
  await r.hover(row.locator('.ap-head b'), { label: 'Bearing SPP-003 – sent for approval', ms: 900, dwell: 1200 });
  r.mark('pending-bearing');
  await r.click(row.locator('button', { hasText: 'Approve' }), { label: 'Approve', ms: 700 });
  // the app has no toast: the approved request leaves the reviewer's queue (the editor overlays ApprovalToast here)
  await row.waitFor({ state: 'detached', timeout: 10000 });
  r.mark('toast-approved');
  await r.pause(2500);
  return r.finish();
}

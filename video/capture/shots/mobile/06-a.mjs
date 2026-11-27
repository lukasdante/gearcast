// 06-a (tablet, MT-01 Mia): Spare Readiness → grease SPP-018 (accessory) → Deploy on M-101A → instant "deployed" + Approved;
// bearing SPP-003 (major) → Request approval for P-101A → "sent … for approval" + Pending approval.
import { take } from './common.mjs';

export default () => take({ shot: '06-a', device: 'tablet', user: 'MT-01' }, async s => {
  const { page, tap, type, mark, sleep, scrollTo } = s;
  await tap(page.locator('.sidebar .nav-item', { hasText: 'Spare Readiness' }), 'Spare Readiness');
  await page.locator('input[aria-label="Search spare parts"]').waitFor();
  mark('spares-page');
  await sleep(1000);

  const deploy = async ({ q, id, asset, reason, button, markName }) => {
    const search = page.locator('input[aria-label="Search spare parts"]');
    await search.fill('');
    await type(search, q, `Search ${q}`);
    const row = page.locator('.sp-table tbody tr', { has: page.locator('td.mono', { hasText: new RegExp(`^${id}$`) }) });
    await row.waitFor();
    await sleep(400);
    await tap(row.locator('.ring-btn'), `${id} details`);
    const modal = page.locator('.modal');
    await modal.waitFor();
    mark(`${id}-details`);
    await sleep(700);
    await tap(modal.locator('.sp-deploy button'), 'Deploy');
    await page.locator('.modal input[placeholder^="Work order"]').waitFor();
    mark(`${id}-deploy-form`);
    const sel = page.locator('.modal select');
    await tap(sel, `Install on ${asset}`, { settle: 0 });
    await sel.selectOption(asset);
    await type(page.locator('.modal input[placeholder^="Work order"]'), reason, 'Reason');
    await tap(page.locator('.modal').getByRole('button', { name: button, exact: true }), button);
    await page.locator('.modal').waitFor({ state: 'detached' });
    await page.locator('.alert-box.ok', { hasText: id }).waitFor();
    await scrollTo(null, page.locator('.page-head'), { offset: 0, ms: 900, label: 'Result' });
    mark(markName);
    await sleep(2600);
  };

  await deploy({ q: 'grease', id: 'SPP-018', asset: 'M-101A', reason: 'PM greasing, motor M-101A (drives P-101A)', button: 'Deploy', markName: 'deployed' });
  await deploy({ q: 'pump bearing', id: 'SPP-003', asset: 'P-101A', reason: 'DE bearing change, P-101A vibration rising', button: 'Request approval', markName: 'sent-for-approval' });
  console.log('  queue:', (await page.locator('.ap-row').allInnerTexts()).map(t => t.replace(/\n+/g, ' | ').slice(0, 160)));
  console.log('  alert:', await page.locator('.alert-box.ok').innerText());
});

// 03-a (phone, MT-01 Mia): Scan QR → fake camera sees the P-101A label → lock → quick view → status, work orders,
// readings, failures → hold on Last readings (vibration). Fake camera: qr-cam.y4m built by make_fake_cam.py.
import { take } from './common.mjs';

export default (cam) => take({
  shot: '03-a', device: 'phone', user: 'MT-01',
  launchArgs: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${cam}`],
  contextOptions: { permissions: ['camera'] },
}, async ({ page, tap, mark, scrollTo, sleep }) => {
  await tap(page.locator('.qr-fab'), 'Scan QR');
  mark('scanner-open');
  await page.locator('.qr-cam video.on').waitFor();
  mark('camera-on');
  await page.locator('.qr-cam-hint.busy, .qv-head').first().waitFor();
  mark('qr-locked');
  await page.locator('.qv-head').waitFor();
  mark('quick-view');
  await sleep(1600);
  const card = t => page.locator('.qv-card', { has: page.locator('h3', { hasText: t }) }).first();
  for (const [t, name, hold] of [['Status history', 'status', 1100], ['Work orders', 'work-orders', 1100], ['Failure', 'failures', 1100], ['Last readings', 'last-readings', 0]]) {
    if (!(await card(t).count())) { console.log('  (no card', t, ')'); continue; }
    await scrollTo('.qv-body', card(t), { label: t });
    mark(name);
    await sleep(hold);
  }
  const vib = page.locator('.qv-card .readings .reading').first();
  const b = await vib.boundingBox();
  mark('vibration');
  console.log('  vibration DE box', b, await vib.innerText());
  await sleep(2500);
});

// 07-a (phone, MT-01 Mia): Caster → attach worn-bearing.png → "write an incident report for P-101A" → confirm card → Confirm.
import path from 'node:path';
import { take, ILLU } from './common.mjs';
import { openCaster, sendAndWatch } from './caster.mjs';

export default () => take({ shot: '07-a', device: 'phone', user: 'MT-01' }, async s => {
  const { page, tap, type, mark, sleep } = s;
  await openCaster(s);
  const chooser = page.waitForEvent('filechooser');
  await tap(page.locator('button[aria-label="Attach photo"]'), 'Attach photo');
  await (await chooser).setFiles(path.join(ILLU, 'worn-bearing.png'));
  await page.locator('.chat-attach img').waitFor();
  mark('photo-attached');
  await sleep(900);
  await type(page.locator('.chat-input input:not([type=file])'), 'write an incident report for P-101A');
  mark('typed');
  const r = await sendAndWatch(s);
  console.log('  tools:', r.chips.join(' | '), 'ops', r.ops);
  const card = page.locator('.op-card.ask').last();
  await card.waitFor({ timeout: 5000 });
  console.log('  card:', await card.innerText());
  await sleep(600);
  await tap(card.getByRole('button', { name: 'Confirm' }), 'Confirm');
  mark('confirmed');
  await page.locator('.op-card.done, .op-card.error').last().waitFor({ timeout: 90000 });
  mark('incident-filed');
  console.log('  result:', await page.locator('.op-card').last().innerText());
  await sleep(1500);
});

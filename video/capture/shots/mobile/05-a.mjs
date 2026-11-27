// 05-a (phone, MT-01 Mia): Caster → "P-101A vibration is rising, what should I check?" → tool chips → streamed answer.
import { take } from './common.mjs';
import { openCaster, sendAndWatch } from './caster.mjs';

export default () => take({ shot: '05-a', device: 'phone', user: 'MT-01' }, async s => {
  const { page, type, mark, sleep } = s;
  await openCaster(s);
  await type(page.locator('.chat-input input:not([type=file])'), process.env.CASTER_Q || 'P-101A vibration is rising. What should I check, and do we have the parts?');
  mark('typed');
  const r = await sendAndWatch(s);
  console.log('  tools:', r.chips.join(' | '));
  await sleep(1200);
  // show the reply from the top (tool chips first), then glide down through the answer
  const body = page.locator('.chat-body');
  const msg = page.locator('.chat-msg.bot').last();
  await s.scrollTo('.chat-body', page.locator('.chat-msg.me').last(), { ms: 900, label: 'Reply top' });
  mark('reply-top');
  await sleep(1800);
  const h = await body.evaluate(b => b.scrollHeight - b.clientHeight - b.scrollTop);
  if (h > 20) {
    await s.scrollTo('.chat-body', msg.locator('> *').last(), { ms: Math.min(4000, 800 + h * 4), offset: 300, label: 'Answer' });
    mark('reply-bottom');
  }
  await sleep(1500);
  console.log('  answer:', (await msg.innerText()).slice(0, 900).replace(/\n+/g, ' / '));
});

// Caster helpers for 05-a / 07-a: open the chat, send, log tool chips / op cards as marks while the answer streams.
export async function openCaster({ page, tap, mark }) {
  // capture-only workaround: on phones the floating Scan QR button sits on top of Caster's Send button (app bug)
  await page.addStyleTag({ content: '.qr-fab{display:none!important}' });
  await tap(page.locator('button[aria-label="Ask Caster"]'), 'Ask Caster');
  await page.locator('section.chat').waitFor();
  mark('caster-open');
}

/** Send and watch the stream: marks tool:<label> (start), tool-done:<label>, answer-start, op-card, answer-done. */
export async function sendAndWatch({ page, tap, mark, sleep }, { timeout = 120000 } = {}) {
  const n0 = await page.locator('.chat-msg.bot').count();
  await tap(page.locator('button[aria-label="Send"]'), 'Send', { before: 500, settle: 0 });
  mark('sent');
  const seen = new Set(); let answer = false, ops = 0; const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const st = await page.evaluate(n0 => {
      const bots = document.querySelectorAll('.chat-msg.bot'); const m = bots[bots.length - 1];
      if (bots.length <= n0) return null;
      return {
        chips: [...m.querySelectorAll('.tool-chip')].map(c => [c.textContent.replace(/…$/, '').trim(), c.classList.contains('done')]),
        text: (m.querySelector('.md, p, ul, ol') ? m.innerText : '').length,
        ops: m.querySelectorAll('.op-card').length,
        idle: !document.querySelector('.chat-input input:not([type=file])').disabled,
      };
    }, n0);
    if (st) {
      for (const [l, done] of st.chips) {
        if (!seen.has('s' + l)) { seen.add('s' + l); mark(`tool:${l}`); }
        if (done && !seen.has('d' + l)) { seen.add('d' + l); mark(`tool-done:${l}`); }
      }
      if (!answer && st.text > 40 && st.chips.every(c => c[1])) { answer = true; mark('answer-start'); }
      if (st.ops > ops) { ops = st.ops; mark('op-card'); }
      if (st.idle) { mark('answer-done'); return { chips: [...seen].filter(s => s[0] === 's').map(s => s.slice(1)), ops }; }
    }
    await sleep(100);
  }
  throw new Error('Caster did not finish');
}

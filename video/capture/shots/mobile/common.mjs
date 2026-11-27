// Shared helpers for the phone / tablet shots (03-a, 05-a, 05-b, 06-a, 07-a, 11-a).
// Recording: the engine's recorder (video/scripts/lib/timeline-recorder.mjs: device-res screencast → 30 fps VP9 + timeline
// JSON on the same clock). This adds the story clock, sign-in, human pacing, marks, trim and an H.264 .mp4 copy.
// Server: CAPTURE_PORT (agent 5b uses 8791 — see run-mobile.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, BASE, AS_OF, ACCOUNTS } from '../../lib.mjs';
import { startCapture } from '../../../scripts/lib/timeline-recorder.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../../../..');
export const ILLU = path.join(ROOT, 'video/public/illustrations');
export const OUT = path.join(ROOT, 'video/public/captures');
export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** API login (unrecorded setup): returns a Cookie header value. */
export async function apiLogin(user) {
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-gearcast-as-of': AS_OF },
    body: JSON.stringify({ username: user, password: ACCOUNTS[user].password }) });
  if (!r.ok) throw new Error(`login ${user}: ${r.status}`);
  return r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
}

/**
 * Runs one take. body(s) gets { page, cap, tap, type, mark, scrollTo, hold }.
 * Pre-roll ≥2 s after the app is ready, post-roll 2 s; trim.inSec = app ready (splash gone) + 0.2.
 */
export async function take({ shot, device, user, launchArgs = [], contextOptions = {} }, body) {
  const browser = await launch({ args: launchArgs });
  const marks = [];
  try {
    const cap = await startCapture(browser, {
      name: shot, device, outDir: OUT,
      contextOptions: {
        timezoneId: 'Asia/Manila', locale: 'en-PH', extraHTTPHeaders: { 'x-gearcast-as-of': AS_OF },
        isMobile: true, ...contextOptions,
      },
    });
    await cap.context.clock.install({ time: new Date(AS_OF.replace(' ', 'T') + ':00+08:00') });
    const page = cap.page;
    page.setDefaultTimeout(60000);
    const mark = name => { marks.push({ t: cap.t(), name }); console.log(`  [${cap.t().toFixed(2)}] ${name}`); };

    // sign in through the real form (inside the recording, trimmed away)
    const a = ACCOUNTS[user];
    await page.goto(BASE + '/');
    await page.getByRole('tab', { name: a.role }).click();
    await page.locator('.login-card select').selectOption(user);
    await page.locator('.login-card input[type=password]').fill(a.password);
    await page.locator('.login-card button[type=submit]').click();
    await page.locator('.app-main').waitFor({ timeout: 30000 });
    await page.locator('.splash').waitFor({ state: 'detached', timeout: 30000 });
    await sleep(400);
    mark('app-ready');
    const inSec = +(marks[0].t + 0.2).toFixed(2);

    /** human-paced tap: ~0.6–1 s look before the finger lands */
    const tap = async (loc, label, { before = 750, settle = 300 } = {}) => {
      await loc.waitFor({ state: 'visible' });
      await loc.scrollIntoViewIfNeeded();
      await sleep(before);
      await cap.click(loc, { label, settle });
    };
    const type = async (loc, text, label) => { await sleep(500); await cap.type(loc, text, { label: label ?? text, delay: 30 }); };
    /** smooth-scroll a container so `loc` sits near the top; logs a scroll event with dy */
    const scrollTo = async (scroller, loc, { offset = 12, ms = 700, label } = {}) => {
      const r = await page.evaluate(async ([sel, ms, offset]) => {
        const [scSel, tgt] = sel;
        let sc = scSel ? document.querySelector(scSel) : null;
        if (!sc) { sc = tgt.parentElement; while (sc && !(sc.scrollHeight > sc.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement; sc ||= document.scrollingElement; }
        const el = tgt;
        const from = sc.scrollTop;
        const top0 = sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top;
        const to = Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight, from + el.getBoundingClientRect().top - top0 - offset));
        const b = sc === document.scrollingElement ? { x: 0, y: 0, width: innerWidth, height: innerHeight } : sc.getBoundingClientRect();
        const t0 = performance.now();
        await new Promise(res => { const f = () => { const p = Math.min(1, (performance.now() - t0) / ms); const e = p < .5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2; sc.scrollTop = from + (to - from) * e; p < 1 ? requestAnimationFrame(f) : res(); }; f(); });
        return { dy: Math.round(to - from), x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height * 0.6) };
      }, [[scroller, await loc.elementHandle()], ms, offset]);
      cap.events.push({ t: +(cap.t() - ms / 1000).toFixed(3), type: 'scroll', x: r.x, y: r.y, dy: r.dy, ...(label ? { label } : {}) });
      return r;
    };
    await sleep(2000);
    await body({ page, cap, tap, type, mark, scrollTo, sleep });
    mark('end-action');
    const outSec = +(cap.t() + 1.5).toFixed(2);
    await sleep(2000);
    const { video, json } = await cap.finish();

    const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', video]).toString().trim().split(',').map(Number);
    const out = { shot, ...json, device, videoSize: { w, h }, trim: { inSec, outSec: Math.min(outSec, json.durationSec) }, marks,
      events: json.events.map(e => ({ ...e, ...(e.type === 'click' ? { tap: true } : {}) })) };
    fs.writeFileSync(path.join(OUT, `${shot}.json`), JSON.stringify(out, null, 1));
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', video, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, `${shot}.mp4`)]);
    console.log(`${shot}: ${video} ${w}x${h} ${json.durationSec}s trim ${inSec}–${out.trim.outSec}`);
    return out;
  } finally {
    await browser.close().catch(() => {});
  }
}

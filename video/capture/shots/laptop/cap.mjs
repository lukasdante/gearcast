// Laptop capture helpers (agent 5a). Records a shot with page.screencast (JPEG q92 frames at 1920×1200, timestamped
// on the same wall clock as the events) → constant-30 fps VP9 .webm + H.264 .mp4, and writes the timeline JSON
// (shot, device, viewport, durationSec, trim, events, marks) the Remotion Cursor/Camera consume.
//
// t = seconds from the start of the video file = from screencast start. Recording can start after login/navigation
// (startRec), so splash/loading never enters the file unless a shot wants it (02-a).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { newStoryContext, login, BASE, ACCOUNTS } from '../../lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../../../..');
export const OUT = path.join(ROOT, 'video/public/captures');
export const ILLU = path.join(ROOT, 'video/public/illustrations');
export { BASE, ACCOUNTS, login };
const VW = 1920, VH = 1200;
export const sleep = ms => new Promise(r => setTimeout(r, ms));
const ease = p => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

/** Full Chromium (has the PDF viewer) on the real GPU via ANGLE/EGL: ~60 fps 3D. CAPTURE_GL=swiftshader falls back. */
export function launch() {
  const args = process.env.CAPTURE_GL === 'swiftshader'
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : ['--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'];
  return chromium.launch({ channel: 'chromium', args: [...args, '--hide-scrollbars'] });
}

/** Fresh story-clock context + page, signed in as `user` (unless login:false). Nothing is recorded yet. */
export async function openAs(browser, user, { login: doLogin = true, acceptDownloads = true } = {}) {
  const context = await newStoryContext(browser, 'laptop', { acceptDownloads });
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) console.log(`  [console] ${m.text().slice(0, 200)}`); });
  page.on('pageerror', e => console.log(`  [pageerror] ${e.message.slice(0, 200)}`));
  if (doLogin) await login(page, user);
  return { context, page };
}

/** Start recording `page`. Returns the recorder: move/hover/click/type/scroll/mark/pause/finish. */
export async function startRec(page, name, { quality = 92 } = {}) {
  const tmp = path.join(OUT, `.tmp-${name}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const frames = [];
  let pending = Promise.resolve();
  let n = 0;
  const t0 = Date.now();
  await page.screencast.start({
    quality, size: { width: VW, height: VH },
    onFrame: ({ data, timestamp }) => {
      const f = path.join(tmp, `f${String(++n).padStart(6, '0')}.jpg`);
      frames.push([timestamp, f]);
      pending = pending.then(() => fs.promises.writeFile(f, data));
    },
  });
  const events = [], marks = [];
  let mx = VW / 2, my = VH / 2;
  const t = () => +((Date.now() - t0) / 1000).toFixed(3);
  const centre = b => ({ x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.h / 2) });
  async function boxOf(target, scroll = true) {
    if (!target || typeof target.boundingBox !== 'function') return null;
    await target.waitFor({ state: 'visible', timeout: 30000 });
    if (scroll) await target.scrollIntoViewIfNeeded();
    const b = await target.boundingBox();
    return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null;
  }
  async function glide(x, y, ms = 750) {
    // time-based: the eased path always takes ~ms of wall time, however slow each mouse.move round-trip is
    const sx = mx, sy = my, s0 = Date.now();
    for (;;) {
      const p = Math.min(1, (Date.now() - s0) / ms);
      const e = ease(p);
      await page.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e);
      if (p >= 1) break;
      await sleep(12);
    }
    mx = x; my = y;
  }
  const at = (target, b, off) => { const p = b ? centre(b) : target; return off ? { x: p.x + off.x, y: p.y + off.y } : p; };
  const rec = {
    page, t, events, marks,
    pause: ms => sleep(ms),
    mark: (name, extra = {}) => { marks.push({ t: t(), name, ...extra }); },
    async move(target, { label, ms, offset, scroll } = {}) {
      const b = await boxOf(target, scroll);
      const p = at(target, b, offset);
      await glide(p.x, p.y, ms);
      events.push({ t: t(), x: p.x, y: p.y, type: 'move', ...(label ? { label } : {}) });
    },
    async hover(target, { label, ms, dwell = 600, offset, scroll } = {}) {
      const b = await boxOf(target, scroll);
      const p = at(target, b, offset);
      await glide(p.x, p.y, ms);
      events.push({ t: t(), x: p.x, y: p.y, type: 'hover', ...(label ? { label } : {}), ...(b ? { box: b } : {}) });
      await sleep(dwell);
    },
    async click(target, { label, ms, settle = 300, offset, scroll, pre = 140 } = {}) {
      const b = await boxOf(target, scroll);
      const p = at(target, b, offset);
      await glide(p.x, p.y, ms);
      await sleep(pre);
      events.push({ t: t(), x: p.x, y: p.y, type: 'click', ...(label ? { label } : {}), ...(b ? { box: b } : {}) });
      await page.mouse.down(); await sleep(70); await page.mouse.up();
      await sleep(settle);
    },
    /** click into a field, select its content, type at ~25 ms/char */
    async type(target, text, { label, delay = 25, ms, selectAll = false } = {}) {
      const b = await boxOf(target);
      const p = at(target, b);
      await glide(p.x, p.y, ms);
      await sleep(120);
      events.push({ t: t(), x: p.x, y: p.y, type: 'click', label: label ? `${label} field` : 'field', ...(b ? { box: b } : {}) });
      await page.mouse.click(p.x, p.y);
      if (selectAll) await page.keyboard.press('Control+A');
      events.push({ t: t(), x: p.x, y: p.y, type: 'type', label: label ?? text, ...(b ? { box: b } : {}) });
      await page.keyboard.type(text, { delay });
    },
    async drag(from, to, { label, ms = 900 } = {}) {
      await glide(from.x, from.y);
      await sleep(150);
      events.push({ t: t(), x: from.x, y: from.y, type: 'click', label: label ? `${label} (grab)` : 'grab' });
      await page.mouse.down();
      await glide(to.x, to.y, ms);
      await sleep(120);
      await page.mouse.up();
      events.push({ t: t(), x: to.x, y: to.y, type: 'move', label: label ? `${label} (drop)` : 'drop' });
    },
    async scroll(dy, { x, y, ms = 700, label } = {}) {
      const px = x ?? mx, py = y ?? my;
      if (px !== mx || py !== my) await glide(px, py, 400);
      events.push({ t: t(), x: px, y: py, type: 'scroll', dy, ...(label ? { label } : {}) });
      const steps = 14;
      for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, dy / steps); await sleep(ms / steps); }
    },
    /** stop, encode, write <name>.webm/.mp4/.json. trim = {inSec,outSec} (defaults: whole file). */
    async finish({ trim, keepPage = false } = {}) {
      const endT = t();
      await page.screencast.stop();
      await pending;
      const rows = frames.map(([ts, f]) => [Math.max(0, ts - t0) / 1000, f]).sort((a, b) => a[0] - b[0]);
      if (!rows.length) throw new Error('no frames');
      rows[0][0] = 0;
      let list = '';
      rows.forEach(([ts, f], i) => { const next = i + 1 < rows.length ? rows[i + 1][0] : endT; list += `file '${f}'\nduration ${Math.max(0.001, next - ts).toFixed(4)}\n`; });
      list += `file '${rows[rows.length - 1][1]}'\n`;
      fs.writeFileSync(path.join(tmp, 'list.txt'), list);
      const webm = path.join(OUT, `${name}.webm`), mp4 = path.join(OUT, `${name}.mp4`);
      const vf = `fps=30,scale=${VW}:${VH}:flags=lanczos,format=yuv420p`;
      const enc = (args, dest) => execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'), '-vf', vf, ...args, dest]);
      enc(['-c:v', 'libvpx-vp9', '-crf', '18', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '3', '-g', '30'], webm);
      enc(['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-movflags', '+faststart', '-g', '30'], mp4);
      fs.rmSync(tmp, { recursive: true, force: true });
      const durationSec = +(+execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', webm]).toString().trim()).toFixed(3);
      const json = { shot: name, device: 'laptop', viewport: { w: VW, h: VH }, durationSec,
        trim: trim ?? autoTrim(events, marks, durationSec), events, marks,
        frameStats: { frames: rows.length, firstFrameOffsetMs: frames.length ? Math.round(Math.min(...frames.map(f => f[0])) - t0) : null } };
      fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(json, null, 1));
      console.log(`${name}: ${durationSec}s, ${events.length} events, ${marks.length} marks, ${rows.length} frames → ${webm}`);
      if (!keepPage) await page.context().close();
      return json;
    },
  };
  return rec;
}

/** default trim: 2 s before the first action, 2.5 s after the last action/mark */
function autoTrim(events, marks, dur) {
  const ts = [...events, ...marks].map(e => e.t);
  if (!ts.length) return { inSec: 0, outSec: dur };
  return { inSec: +Math.max(0, Math.min(...ts) - 2).toFixed(2), outSec: +Math.min(dur, Math.max(...ts) + 2.5).toFixed(2) };
}

// ----------------------------------------------------------------------------- API helpers (prep, not recorded)
const jar = {};
export async function api(user, p, init = {}) {
  if (!jar[user]) {
    const l = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: user, password: ACCOUNTS[user].password }) });
    if (l.status !== 200) throw new Error(`login ${user} → ${l.status}`);
    jar[user] = (l.headers.get('set-cookie') || '').split(';')[0];
  }
  const h = { cookie: jar[user], 'x-gearcast-as-of': process.env.CAPTURE_AS_OF || '2026-11-28 14:00', ...(init.json ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) };
  const r = await fetch(BASE + p, { method: init.method || 'GET', headers: h, body: init.json ? JSON.stringify(init.json) : init.body });
  const b = await r.json().catch(() => null);
  if (!r.ok && !init.allowFail) throw new Error(`${init.method || 'GET'} ${p} as ${user} → ${r.status} ${JSON.stringify(b)?.slice(0, 200)}`);
  return b;
}

/** reset.sh (fresh D1/R2) — call before each take */
export function reset() {
  execFileSync(path.join(ROOT, 'video/capture/reset.sh'), [], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (const k of Object.keys(jar)) delete jar[k];
}

/** illustration path, or a temporary stand-in (logged) while the real one is missing */
export function illustration(name) {
  const p = path.join(ILLU, name);
  if (fs.existsSync(p)) return p;
  const tmp = path.join(here, '.tmp-illustrations', name);
  if (!fs.existsSync(tmp)) {
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=0x5a6470:s=1200x900,drawtext=text='${name} (placeholder)':fontcolor=white:fontsize=48:x=(w-tw)/2:y=(h-th)/2`, '-frames:v', '1', tmp]);
  }
  console.log(`  ! ${name} missing in illustrations/ — using placeholder ${tmp}`);
  return tmp;
}

/** wait until no request is in flight for `quiet` ms */
export async function settle(page, quiet = 500, max = 15000) {
  await page.waitForLoadState('networkidle', { timeout: max }).catch(() => {});
  await sleep(quiet);
}

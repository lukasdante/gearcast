// Playwright helper that records a .webm AND the capture-timeline JSON the Remotion engine expects
// (see src/lib/capture.ts for the contract). Optional for capture agents — any script that writes the same JSON works.
//
//   import { chromium } from 'playwright';
//   import { startCapture } from '../scripts/lib/timeline-recorder.mjs';
//   const browser = await chromium.launch();
//   const cap = await startCapture(browser, { name: '04-a', device: 'laptop', outDir: 'public/captures' });
//   await cap.page.goto(url);
//   await cap.click(cap.page.getByRole('button', { name: 'Simulate fault' }), { label: 'Simulate fault' });
//   await cap.finish();      // → public/captures/04-a.webm + 04-a.json
//
// Timing: t = seconds since the page (and its video) was created. Pointer moves are human-paced (eased, ~0.6 s);
// `click` logs the moment of mousedown and the target's bounding box (used for the "pop").
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const VIEWPORTS = {
  laptop: { viewport: { width: 1920, height: 1200 }, dpr: 1, touch: false },
  tablet: { viewport: { width: 1280, height: 800 }, dpr: 2, touch: true },
  phone: { viewport: { width: 390, height: 844 }, dpr: 3, touch: true },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

/**
 * mode 'screencast' (default): JPEG frames (q≈92) at device resolution via page.screencast, timestamped on the same
 * wall clock as the events, then encoded to a constant-30fps high-quality VP9 .webm. Crisp text; best sync.
 * mode 'video': Playwright's built-in recordVideo (low bitrate, fallback).
 */
export async function startCapture(browser, { name, device = 'laptop', outDir = 'public/captures', contextOptions = {}, mode = 'screencast', quality = 92 }) {
  const spec = VIEWPORTS[device];
  const tmpDir = path.join(outDir, `.tmp-${name}`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const size = { width: spec.viewport.width * spec.dpr, height: spec.viewport.height * spec.dpr };
  const context = await browser.newContext({
    viewport: spec.viewport,
    deviceScaleFactor: spec.dpr,
    hasTouch: spec.touch,
    isMobile: device === 'phone',
    ...(mode === 'video' ? { recordVideo: { dir: tmpDir, size } } : {}),
    ...contextOptions,
  });
  const page = await context.newPage();
  const frames = []; // [wallMs, file]
  let pending = Promise.resolve();
  if (mode === 'screencast') {
    let n = 0;
    await page.screencast.start({
      quality,
      size,
      onFrame: ({ data, timestamp }) => {
        const file = path.join(tmpDir, `f${String(++n).padStart(6, '0')}.jpg`);
        frames.push([timestamp, file]);
        pending = pending.then(() => fs.promises.writeFile(file, data));
      },
    });
  }
  const t0 = Date.now();
  const events = [];
  let mx = spec.viewport.width / 2;
  let my = spec.viewport.height / 2;
  const t = () => +((Date.now() - t0) / 1000).toFixed(3);
  const log = (e) => events.push({ t: t(), ...e });

  async function boxOf(target) {
    if (!target || typeof target.boundingBox !== 'function') return null;
    await target.waitFor({ state: 'visible' });
    await target.scrollIntoViewIfNeeded();
    const b = await target.boundingBox();
    return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null;
  }
  async function glide(x, y, ms = 600) {
    const steps = Math.max(8, Math.round(ms / 16));
    const sx = mx, sy = my;
    for (let i = 1; i <= steps; i++) {
      const p = easeInOut(i / steps);
      await page.mouse.move(sx + (x - sx) * p, sy + (y - sy) * p);
      await sleep(ms / steps);
    }
    mx = x; my = y;
  }
  const centre = (b) => ({ x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.h / 2) });

  return {
    page, context, events, t,
    /** wait (real time) — use sparingly; prefer waiting for elements */
    pause: (ms) => sleep(ms),
    async move(target, { label, ms } = {}) {
      const b = await boxOf(target);
      const p = b ? centre(b) : target;
      if (!spec.touch) await glide(p.x, p.y, ms);
      log({ type: 'move', x: p.x, y: p.y, ...(label ? { label } : {}) });
    },
    async hover(target, { label, ms, dwell = 500 } = {}) {
      const b = await boxOf(target);
      const p = b ? centre(b) : target;
      if (!spec.touch) await glide(p.x, p.y, ms);
      log({ type: 'hover', x: p.x, y: p.y, ...(label ? { label } : {}), ...(b ? { box: b } : {}) });
      await sleep(dwell);
    },
    async click(target, { label, ms, settle = 250 } = {}) {
      const b = await boxOf(target);
      const p = b ? centre(b) : target;
      if (spec.touch) {
        log({ type: 'click', x: p.x, y: p.y, ...(label ? { label } : {}), ...(b ? { box: b } : {}) });
        await page.touchscreen.tap(p.x, p.y);
      } else {
        await glide(p.x, p.y, ms);
        await sleep(120);
        log({ type: 'click', x: p.x, y: p.y, ...(label ? { label } : {}), ...(b ? { box: b } : {}) });
        await page.mouse.down();
        await sleep(70);
        await page.mouse.up();
      }
      await sleep(settle);
    },
    async type(target, text, { label, delay = 55 } = {}) {
      const b = await boxOf(target);
      const p = b ? centre(b) : { x: mx, y: my };
      if (b) {
        if (spec.touch) await page.touchscreen.tap(p.x, p.y);
        else { await glide(p.x, p.y); await page.mouse.click(p.x, p.y); }
      }
      log({ type: 'type', x: p.x, y: p.y, label: label ?? text, ...(b ? { box: b } : {}) });
      await page.keyboard.type(text, { delay });
    },
    async scroll(dy, { x, y, ms = 500 } = {}) {
      const px = x ?? mx, py = y ?? my;
      log({ type: 'scroll', x: px, y: py, dy });
      const steps = 10;
      for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, dy / steps); await sleep(ms / steps); }
    },
    async finish() {
      const endT = t();
      const dest = path.join(outDir, `${name}.webm`);
      if (mode === 'screencast') {
        await page.screencast.stop();
        await pending;
        await context.close();
        // concat list with per-frame durations (screencast only sends frames on change → hold previous frame)
        const rows = frames.map(([ts, f]) => [Math.max(0, (ts - t0) / 1000), f]).sort((a, b) => a[0] - b[0]);
        if (!rows.length) throw new Error('screencast produced no frames');
        rows[0][0] = 0; // first frame covers the head
        let list = '';
        rows.forEach(([ts, f], i) => {
          const next = i + 1 < rows.length ? rows[i + 1][0] : endT;
          list += `file '${path.resolve(f)}'\nduration ${Math.max(0.001, next - ts).toFixed(4)}\n`;
        });
        list += `file '${path.resolve(rows[rows.length - 1][1])}'\n`;
        const listFile = path.join(tmpDir, 'list.txt');
        fs.writeFileSync(listFile, list);
        execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
          '-vf', `fps=30,scale=${size.width}:${size.height}:flags=lanczos,format=yuv420p`,
          '-c:v', 'libvpx-vp9', '-crf', '18', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '3', '-g', '30', dest]);
      } else {
        const video = page.video();
        await context.close();
        const src = await video.path();
        // Playwright's webm has no duration/cues; remux so seeking (and ffprobe) work.
        try {
          execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-c', 'copy', dest]);
        } catch {
          fs.copyFileSync(src, dest);
        }
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
      let durationSec = endT;
      try {
        const d = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dest]).toString().trim();
        if (Number.isFinite(d) && d > 0) durationSec = +d.toFixed(3);
      } catch {}
      const json = { device, viewport: { w: spec.viewport.width, h: spec.viewport.height }, durationSec, events };
      fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(json, null, 1));
      return { video: dest, json };
    },
  };
}

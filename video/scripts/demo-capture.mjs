#!/usr/bin/env node
// Records public/captures/_demo.webm + _demo.json from scripts/demo-page.html to prove Cursor/Camera sync.
// The page drops a yellow dot at every real mousedown — in the edit, the cursor ripple should land on it.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startCapture } from './lib/timeline-recorder.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../public/captures');
const browser = await chromium.launch();
const cap = await startCapture(browser, { name: '_demo', device: 'laptop', outDir });
const { page } = cap;
await page.goto(pathToFileURL(path.join(here, 'demo-page.html')).href);
await page.waitForLoadState('networkidle');
await cap.pause(900);
await cap.move({ x: 700, y: 520 }, { ms: 500 });
await cap.click(page.locator('#sim'), { label: 'Simulate fault' });
await cap.pause(900);
await cap.hover(page.locator('#cost'), { label: 'Shutdown cost', dwell: 900 });
await cap.type(page.locator('#q'), 'bearing replacement', { label: 'bearing replacement' });
await cap.click(page.locator('#go'), { label: 'Search' });
await cap.pause(600);
await cap.scroll(300, { x: 1100, y: 900 });
await cap.pause(500);
await cap.click(page.locator('#reset'), { label: 'Reset simulation' });
await cap.pause(1200);
const { json } = await cap.finish();
await browser.close();
console.log(`_demo: ${json.durationSec}s, ${json.events.length} events`);

// Render the React-built illustrations to video/public/illustrations/*.png, shrink photo PNGs to < 1 MB
// (256-colour quantise with dithering, opaque), and verify the QR label decodes.
//   cd video && node src/scenes/motion/render-illustrations.mjs [id …]
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const video = path.resolve(here, '../../..');
const out = path.join(video, 'public/illustrations');
const entry = 'src/scenes/motion/entry.ts';
const ALL = {
  'Illus-worn-bearing': 'worn-bearing.png',
  'Illus-pm-findings-1': 'pm-findings-1.png',
  'Illus-pm-findings-2': 'pm-findings-2.png',
  'Illus-job-sheet': 'job-sheet.png',
  'Illus-qr-label': 'qr-label.png',
};
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ALL);
const LIMIT = 1_000_000;

for (const id of want) {
  const file = path.join(out, ALL[id]);
  execFileSync('npx', ['remotion', 'still', entry, id, file, '--log=error'], { cwd: video, stdio: 'inherit' });
  if (statSync(file).size > LIMIT && id !== 'Illus-qr-label') {
    execFileSync('python3', ['-c', `
import sys
from PIL import Image
p=sys.argv[1]; im=Image.open(p).convert('RGB')
pal=im.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
im.quantize(palette=pal, dither=Image.Dither.FLOYDSTEINBERG).save(p, optimize=True)
`, file]);
  }
  console.log(`${ALL[id]}  ${(statSync(file).size / 1024).toFixed(0)} KB`);
}

if (want.includes('Illus-qr-label')) {
  const req = createRequire(path.join(video, '../app/package.json'));
  const { PNG } = req('pngjs');
  const jsQR = req('jsqr');
  const png = PNG.sync.read(readFileSync(path.join(out, 'qr-label.png')));
  const r = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  const ok = r?.data === 'https://gearcast.engrlouis.dev/asset/P-101A';
  console.log(`qr-label.png decodes: ${r?.data ?? 'NOTHING'} ${ok ? 'OK' : 'FAIL'}`);
  if (!ok) process.exit(1);
}

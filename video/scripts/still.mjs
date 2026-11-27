#!/usr/bin/env node
// npm run still -- <frame[,frame…]> [composition=GearcastPromo]
//   npm run still -- 900                  → out/stills/GearcastPromo-900.png
//   npm run still -- 120,300 ComponentShowcase
//   npm run still -- 100,400 Scene-04
// Bundles once, renders every requested frame.
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [framesArg, comp = 'GearcastPromo'] = process.argv.slice(2);
if (!framesArg) {
  console.error('usage: npm run still -- <frame[,frame…]> [composition]');
  process.exit(1);
}
fs.mkdirSync(path.join(root, 'out/stills'), { recursive: true });
const serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.ts'), publicDir: path.join(root, 'public') });
const composition = await selectComposition({ serveUrl, id: comp, inputProps: {} });
for (const fr of framesArg.split(',').map(Number)) {
  const output = path.join(root, 'out/stills', `${comp}-${fr}.png`);
  await renderStill({ serveUrl, composition, frame: Math.min(fr, composition.durationInFrames - 1), output, inputProps: composition.props, overwrite: true });
  console.log(path.relative(root, output));
}
console.log(`${comp}: ${composition.durationInFrames} frames (${(composition.durationInFrames / composition.fps).toFixed(2)} s)`);

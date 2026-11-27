#!/usr/bin/env node
// Builds src/data/captions.stub.json from docs/video/promo/script.md + public/audio/NN.wav durations.
// Word times are spread evenly (by character weight) — a placeholder until the audio agent's captions.json lands.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const script = fs.readFileSync(path.resolve(root, '../docs/video/promo/script.md'), 'utf8');

function wavSeconds(file) {
  const b = fs.readFileSync(file);
  let off = 12, rate = 44100, ch = 1, bits = 16, dataLen = 0;
  while (off < b.length - 8) {
    const id = b.toString('ascii', off, off + 4);
    const len = b.readUInt32LE(off + 4);
    if (id === 'fmt ') { ch = b.readUInt16LE(off + 10); rate = b.readUInt32LE(off + 12); bits = b.readUInt16LE(off + 22); }
    if (id === 'data') { dataLen = len; break; }
    off += 8 + len + (len % 2);
  }
  return dataLen / (rate * ch * (bits / 8));
}

const SPOKEN = [
  [/P one-oh-one A/g, 'P-101A'], [/P one-oh-one B/g, 'P-101B'],
  [/five point nine million pesos/gi, '₱5.9 million'], [/Five point nine million pesos/g, '₱5.9 million'],
  [/Ten hours/g, '10 hours'], [/six weeks/g, '6 weeks'], [/three production lines/g, '3 production lines'],
  [/one week to one year/g, '1 week to 1 year'], [/Plant two/g, 'Plant 2'],
];
const EMPH = /^(P-101[AB]|GearCast|Caster|XGBoost|Lemuel|Jun|Mia|Ken|Rico|trips|red|critical|approved|approve|approves|expiry|photo|incident|brand|supplier|lead|instant|exact|climbing|early|stayed|price|tap|3D)$/i;

const sections = [...script.matchAll(/^## (\d\d) — [^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)];
const scenes = [];
for (const [, id, body] of sections) {
  let text = body.split('\n').filter((l) => l.startsWith('>')).map((l) => l.replace(/^>\s?/, '')).join(' ').trim();
  for (const [re, rep] of SPOKEN) text = text.replace(re, rep);
  const wav = path.join(root, 'public/audio', `${id}.wav`);
  const durationSec = fs.existsSync(wav) ? +wavSeconds(wav).toFixed(3) : 12;
  const toks = text.split(/\s+/).filter(Boolean);
  const t0 = 0.2, t1 = Math.max(t0 + 1, durationSec - 0.45);
  const weights = toks.map((t) => Math.max(2, t.length) + 2 + (/[.,:?!]$/.test(t) ? 4 : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = t0;
  const words = toks.map((t, i) => {
    const start = acc;
    acc += (weights[i] / total) * (t1 - t0);
    const bare = t.replace(/[.,:?!"“”]+$/g, '').replace(/^["“]/, '');
    return { text: t, start: +start.toFixed(3), end: +(acc - 0.04).toFixed(3), emphasis: EMPH.test(bare) || /₱|\d/.test(bare) };
  });
  scenes.push({ id, audio: `audio/${id}.wav`, durationSec, tailSec: 0.5, words });
}
const out = { fps: 30, generatedBy: 'stub (scripts/make-caption-stub.mjs)', scenes };
fs.writeFileSync(path.join(root, 'src/data/captions.stub.json'), JSON.stringify(out, null, 1));
console.log(`wrote ${scenes.length} scenes to src/data/captions.stub.json`);

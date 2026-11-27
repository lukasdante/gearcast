/**
 * Caption data loader + normaliser.
 *
 * Source of truth: src/data/captions.json (written by the audio-timing agent). Until it exists we fall back to
 * src/data/captions.stub.json (same schema, generated from docs/video/promo/script.md with evenly spread word
 * times). Both are pulled in through webpack's require.context, so a captions.json that appears later is picked
 * up automatically by the Studio (hot reload) and by the next render — no code change needed.
 *
 * Accepted schema (tolerant; extra keys ignored):
 * {
 *   fps?: 30,
 *   scenes: [{
 *     id | scene: "04" | 4,            // scene id; also matched against audio filename
 *     audio?: "audio/04.wav",
 *     durationSec?: 14.56,            // clip length
 *     tailSec?: 0.5,                  // silence/hold to add after the clip
 *     words?:   [{ text, start, end, emphasis?: boolean }],
 *     phrases?: [{ text, start, end, emphasis?: string[] | boolean, words?: [...] }]
 *   }]
 * }
 * Emphasis can also be written inline as **bold** in phrase/word text.
 * If only words are given, they are grouped into phrases (punctuation / pauses / max 5 words).
 * If only phrases are given, word times are spread across each phrase by character length.
 */

export type CapWord = { text: string; start: number; end: number; emphasis: boolean };
export type CapPhrase = { text: string; start: number; end: number; words: CapWord[] };
export type SceneCaptions = {
  id: string;
  audio?: string;
  durationSec?: number;
  tailSec?: number;
  phrases: CapPhrase[];
  words: CapWord[];
};
export type CaptionData = { source: 'captions.json' | 'stub' | 'none'; scenes: Record<string, SceneCaptions> };

declare const require: {
  context(dir: string, recursive: boolean, re: RegExp): { keys(): string[]; (k: string): unknown };
};

type RawWord = { text?: string; word?: string; start?: number; end?: number; t0?: number; t1?: number; startSec?: number; endSec?: number; emphasis?: boolean; emph?: boolean };
type RawPhrase = RawWord & { emphasis?: boolean | string[]; words?: RawWord[] };
type RawScene = {
  id?: string | number; scene?: string | number; audio?: string; file?: string;
  durationSec?: number; duration?: number; tailSec?: number; tail?: number;
  words?: RawWord[]; phrases?: RawPhrase[]; lines?: RawPhrase[]; captions?: RawPhrase[];
};

const pad = (v: string | number) => {
  const m = String(v).match(/\d+/);
  return m ? m[0].padStart(2, '0') : String(v);
};
const num = (...vals: (number | undefined)[]) => vals.find((v) => typeof v === 'number' && Number.isFinite(v)) as number | undefined;
const stripBold = (s: string) => s.replace(/\*\*/g, '');
const normTok = (s: string) => stripBold(s).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9₱.\-]+/g, '').replace(/[.]+$/, '');

/** Words emphasised automatically when the data doesn't say: figures, asset tags, ₱ amounts. */
export const autoEmphasis = (t: string) => /₱|\d|^P-\d|^[A-Z]{2}-\d\d$/.test(stripBold(t));

function rawWordTime(w: RawWord) {
  return { start: num(w.start, w.t0, w.startSec) ?? 0, end: num(w.end, w.t1, w.endSec) ?? 0 };
}

function phraseWords(p: RawPhrase, start: number, end: number): CapWord[] {
  const emphList = Array.isArray(p.emphasis) ? p.emphasis.map(normTok) : [];
  const allEmph = p.emphasis === true;
  if (p.words && p.words.length) {
    return p.words.map((w) => {
      const text = String(w.text ?? w.word ?? '');
      const { start: s, end: e } = rawWordTime(w);
      const explicit = w.emphasis ?? w.emph;
      const emphasis = Boolean(explicit) || allEmph || /\*\*/.test(text) || emphList.includes(normTok(text)) || (explicit === undefined && !emphList.length && autoEmphasis(text));
      return { text: stripBold(text), start: s, end: e, emphasis };
    });
  }
  // Split text and spread times by character weight. Track **bold** spans across tokens.
  const toks: { text: string; bold: boolean }[] = [];
  let bold = false;
  for (const raw of String(p.text ?? '').split(/\s+/).filter(Boolean)) {
    const opens = (raw.match(/\*\*/g) ?? []).length;
    const startsBold = raw.startsWith('**');
    const isBold = bold || startsBold;
    if (opens % 2 === 1) bold = !bold;
    toks.push({ text: stripBold(raw), bold: isBold });
  }
  const weights = toks.map((t) => Math.max(2, t.text.length) + 2);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const span = Math.max(0.05, end - start);
  let acc = start;
  return toks.map((t, i) => {
    const s = acc;
    acc += (weights[i] / total) * span;
    const emphasis = allEmph || t.bold || emphList.includes(normTok(t.text)) || (!emphList.length && !/\*\*/.test(p.text ?? '') && autoEmphasis(t.text));
    return { text: t.text, start: s, end: acc, emphasis };
  });
}

/** Group a flat word list into short caption phrases. */
export function groupWords(words: CapWord[], maxWords = 5, gapSec = 0.32): CapPhrase[] {
  const out: CapPhrase[] = [];
  let cur: CapWord[] = [];
  const flush = () => {
    if (!cur.length) return;
    out.push({ text: cur.map((w) => w.text).join(' '), start: cur[0].start, end: cur[cur.length - 1].end, words: cur });
    cur = [];
  };
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (cur.length && prev && w.start - prev.end > gapSec) flush();
    cur.push(w);
    const hardStop = /[.!?:;]$/.test(w.text) || /[,—–]$/.test(w.text) && cur.length >= 2;
    if (hardStop || cur.length >= maxWords) flush();
  });
  flush();
  return out;
}

function normScene(raw: RawScene, idx: number): SceneCaptions {
  const id = pad(raw.id ?? raw.scene ?? (raw.audio ? raw.audio.split('/').pop()! : idx));
  const rawPhrases = raw.phrases ?? raw.lines ?? raw.captions;
  let phrases: CapPhrase[] = [];
  let words: CapWord[] = [];
  if (rawPhrases && rawPhrases.length) {
    phrases = rawPhrases.map((p) => {
      const { start, end } = rawWordTime(p);
      const ws = phraseWords(p, start, end);
      return { text: stripBold(String(p.text ?? ws.map((w) => w.text).join(' '))), start: ws[0]?.start ?? start, end: Math.max(end, ws[ws.length - 1]?.end ?? end), words: ws };
    });
    words = phrases.flatMap((p) => p.words);
  } else if (raw.words && raw.words.length) {
    words = phraseWords({ words: raw.words }, 0, 0);
    phrases = groupWords(words);
  }
  return {
    id,
    audio: raw.audio ?? raw.file,
    durationSec: num(raw.durationSec, raw.duration),
    tailSec: num(raw.tailSec, raw.tail),
    phrases,
    words,
  };
}

export function normaliseCaptions(json: unknown, source: CaptionData['source']): CaptionData {
  const j = json as { scenes?: RawScene[] | Record<string, RawScene> } | RawScene[] | null;
  let list: RawScene[] = [];
  if (Array.isArray(j)) list = j;
  else if (j && Array.isArray(j.scenes)) list = j.scenes;
  else if (j && j.scenes && typeof j.scenes === 'object') list = Object.entries(j.scenes).map(([k, v]) => ({ id: k, ...v }));
  const scenes: Record<string, SceneCaptions> = {};
  list.forEach((s, i) => {
    const n = normScene(s, i);
    scenes[n.id] = n;
  });
  return { source, scenes };
}

function load(): CaptionData {
  try {
    const ctx = require.context('../data', false, /^\.\/captions(\.stub)?\.json$/);
    const keys = ctx.keys();
    if (keys.includes('./captions.json')) return normaliseCaptions(ctx('./captions.json'), 'captions.json');
    if (keys.includes('./captions.stub.json')) return normaliseCaptions(ctx('./captions.stub.json'), 'stub');
  } catch (e) {
    console.warn('captions: could not load', e);
  }
  return { source: 'none', scenes: {} };
}

export const CAPTIONS: CaptionData = load();

export const sceneCaptions = (id: string): SceneCaptions | undefined => CAPTIONS.scenes[pad(id)];

/** Seconds at which a phrase (word sequence) is spoken in a scene; `fallback` if not found. */
export function cueTime(sceneId: string, phrase: string, fallback: number, which: 'start' | 'end' = 'start'): number {
  const words = sceneCaptions(sceneId)?.words ?? [];
  const toks = phrase.split(/\s+/).map(normTok).filter(Boolean);
  if (!toks.length) return fallback;
  for (let i = 0; i + toks.length <= words.length; i++) {
    let ok = true;
    for (let j = 0; j < toks.length; j++) if (normTok(words[i + j].text) !== toks[j]) { ok = false; break; }
    if (ok) return which === 'start' ? words[i].start : words[i + toks.length - 1].end;
  }
  return fallback;
}

/** Build caption phrases by hand (word times spread across each phrase). Use **bold** for emphasis. */
export function makePhrases(list: { start: number; end: number; text: string }[]): CapPhrase[] {
  return list.map((p) => {
    const words = phraseWords({ text: p.text }, p.start, p.end);
    return { text: stripBold(p.text), start: p.start, end: p.end, words };
  });
}

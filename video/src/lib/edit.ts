/**
 * Editing helpers for timeline.ts: speed-ramp a capture so its visual beats land on narration cue words.
 *
 *   const r = ramp([
 *     { clip: 1.8, at: 0 },                 // clip 1.8 s plays at shot-local 0
 *     { clip: 7.6, at: 3.0, cutTo: 9.45 },  // …fast-forward to 7.6 s, landing at 3.0 s; then jump to 9.45 s
 *     { clip: 13.4, at: 4.2 },
 *   ], { end: 12.6 });                      // keep playing (rate ≥ 1) until shot-local 12.6
 *   r.segments   → CaptureShot segments
 *   r.local(t)   → shot-local seconds where clip time t is shown (NaN if cut)
 *
 * Rates are clamped to [minRate, maxRate] (default 1…3), so a beat lands early rather than slowing footage below 1×;
 * an explicit `rate` on a beat forces the rate of the segment leading into it.
 */
import { Segment } from './capture';

// Capture timelines (marks are read here so a re-take that moves a mark re-syncs the edit automatically).
import c02a from '../../public/captures/02-a.json';
import c03a from '../../public/captures/03-a.json';
import c04a from '../../public/captures/04-a.json';
import c05a from '../../public/captures/05-a.json';
import c05b from '../../public/captures/05-b.json';
import c06a from '../../public/captures/06-a.json';
import c06b from '../../public/captures/06-b.json';
import c07a from '../../public/captures/07-a.json';
import c07b from '../../public/captures/07-b.json';
import c08a from '../../public/captures/08-a.json';
import c09a from '../../public/captures/09-a.json';
import c10a from '../../public/captures/10-a.json';
import c10b from '../../public/captures/10-b.json';
import c11a from '../../public/captures/11-a.json';
import c11b from '../../public/captures/11-b.json';
import c12a from '../../public/captures/12-a.json';
import c13a from '../../public/captures/13-a.json';
import c13b from '../../public/captures/13-b.json';
import c13c from '../../public/captures/13-c.json';

type RawCap = { durationSec?: number; marks?: { t: number; name: string }[]; events?: { t: number; label?: string; type?: string }[] };
const CAPS: Record<string, RawCap> = {
  '02-a': c02a, '03-a': c03a, '04-a': c04a, '05-a': c05a, '05-b': c05b, '06-a': c06a, '06-b': c06b, '07-a': c07a, '07-b': c07b,
  '08-a': c08a, '09-a': c09a, '10-a': c10a, '10-b': c10b, '11-a': c11a, '11-b': c11b, '12-a': c12a, '13-a': c13a, '13-b': c13b, '13-c': c13c,
} as Record<string, RawCap>;

/** Clip time of a named mark in a capture (fallback if the capture/mark is missing). */
export function mark(cap: string, name: string, fallback: number): number {
  const m = CAPS[cap]?.marks?.find((x) => x.name === name);
  if (!m) console.warn(`[edit] mark ${cap}:${name} missing, using ${fallback}`);
  return m ? m.t : fallback;
}

/** Clip time of the first event whose label starts with `label` (optionally of a type). */
export function ev(cap: string, label: string, fallback: number, type?: string): number {
  const e = CAPS[cap]?.events?.find((x) => (x.label ?? '').startsWith(label) && (!type || x.type === type));
  if (!e) console.warn(`[edit] event ${cap}:${label} missing, using ${fallback}`);
  return e ? e.t : fallback;
}

export const capDuration = (cap: string, fallback: number) => CAPS[cap]?.durationSec ?? fallback;

export type Beat = { clip: number; at: number; cutTo?: number; rate?: number };
export type Ramp = { segments: Segment[]; local: (clipT: number) => number; endClip: number; plan: { from: number; to: number; rate: number; start: number }[] };

export function ramp(beats: Beat[], o: { end?: number; maxRate?: number; minRate?: number; endRate?: number; clipEnd?: number } = {}): Ramp {
  const maxRate = o.maxRate ?? 3;
  const minRate = o.minRate ?? 1;
  const plan: Ramp['plan'] = [];
  let clip = beats[0].clip;
  let at = beats[0].at;
  if (beats[0].cutTo !== undefined) clip = beats[0].cutTo;
  for (let i = 1; i < beats.length; i++) {
    const b = beats[i];
    const dc = b.clip - clip;
    if (dc > 0.001) {
      const want = b.at - at;
      const rate = b.rate ?? Math.min(maxRate, Math.max(minRate, want > 0.01 ? dc / want : maxRate));
      plan.push({ from: clip, to: b.clip, rate, start: at });
      at += dc / rate;
    }
    clip = b.cutTo ?? b.clip;
  }
  if (o.end !== undefined && o.end > at + 0.01) {
    // keep playing at ≥ minRate (or endRate) to the end of the shot
    const want = o.end - at;
    const rate = o.endRate ?? minRate;
    let to = clip + want * rate;
    if (o.clipEnd !== undefined) to = Math.min(to, o.clipEnd);
    if (to > clip + 0.01) {
      plan.push({ from: clip, to, rate, start: at });
      at += (to - clip) / rate;
      clip = to;
    }
  }
  const local = (t: number) => {
    for (const s of plan) if (t >= s.from - 1e-6 && t <= s.to + 1e-6) return s.start + (t - s.from) / s.rate;
    return NaN;
  };
  return { segments: plan.map((s) => ({ from: s.from, to: s.to, rate: s.rate })), local, endClip: clip, plan };
}

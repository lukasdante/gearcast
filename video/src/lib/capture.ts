import { useEffect, useState } from 'react';
import { continueRender, delayRender, getStaticFiles, staticFile } from 'remotion';

/**
 * Capture timeline contract — `public/captures/<scene>-<shot>.json`, next to `<scene>-<shot>.webm`.
 *
 * {
 *   "device": "laptop" | "tablet" | "phone",
 *   "viewport": { "w": 1920, "h": 1200 },        // CSS px of the page (phone: 390×844 even when recorded @3x)
 *   "durationSec": 21.4,                          // length of the .webm
 *   "events": [
 *     { "t": 1.20, "x": 960, "y": 600, "type": "move" },
 *     { "t": 2.05, "x": 1412, "y": 88, "type": "click", "label": "Simulate fault",
 *       "box": { "x": 1350, "y": 70, "w": 124, "h": 36 } },          // optional: target element rect → pop
 *     { "t": 3.10, "x": 640, "y": 300, "type": "type", "label": "PS-01" },
 *     { "t": 4.00, "x": 960, "y": 700, "type": "scroll", "dy": 600 },  // dy optional (px scrolled, + = down)
 *     { "t": 5.00, "x": 300, "y": 420, "type": "hover" }
 *   ]
 * }
 * - x, y: viewport CSS px (top-left origin) of the pointer at time t.
 * - t: seconds from the first frame of the .webm. For click, t = the moment of mousedown/tap.
 * - Unknown extra keys (selector, action, note, …) are allowed and ignored. `action` is accepted as an alias of `type`.
 */
export type DeviceKind = 'laptop' | 'tablet' | 'phone';
export type EventType = 'move' | 'click' | 'type' | 'scroll' | 'hover';
export type Box = { x: number; y: number; w: number; h: number };
export type CaptureEvent = { t: number; x: number; y: number; type: EventType; label?: string; box?: Box; dy?: number; selector?: string };
export type CaptureTimeline = { device: DeviceKind; viewport: { w: number; h: number }; durationSec: number; events: CaptureEvent[] };

export function normaliseTimeline(raw: unknown): CaptureTimeline {
  type RawEvent = Partial<CaptureEvent> & { action?: string };
  const r = raw as Omit<Partial<CaptureTimeline>, 'events'> & { events?: RawEvent[] };
  const device = (r.device ?? 'laptop') as DeviceKind;
  const viewport = r.viewport ?? DEFAULT_VIEWPORT[device];
  const events = (r.events ?? [])
    .map((e: RawEvent) => ({ ...e, type: (e.type ?? e.action ?? 'move') as EventType, t: Number(e.t ?? 0), x: Number(e.x ?? 0), y: Number(e.y ?? 0) }) as CaptureEvent)
    .sort((a, b) => a.t - b.t);
  return { device, viewport, durationSec: Number(r.durationSec ?? (events.length ? events[events.length - 1].t + 1 : 10)), events };
}

export const DEFAULT_VIEWPORT: Record<DeviceKind, { w: number; h: number }> = {
  laptop: { w: 1920, h: 1200 },
  tablet: { w: 1280, h: 800 },
  phone: { w: 390, h: 844 },
};

export type CaptureState = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; timeline: CaptureTimeline; video: string };

/**
 * Loads `captures/<id>.json`. Missing file → { status: 'missing' } (callers render a placeholder screen).
 * Uses delayRender so frames are only taken once we know.
 */
export function useCapture(id: string | undefined): CaptureState {
  const [state, setState] = useState<CaptureState>(id ? { status: 'loading' } : { status: 'missing' });
  const [handle] = useState(() => (id ? delayRender(`capture timeline ${id}`) : null));
  useEffect(() => {
    if (!id || handle === null) return;
    let done = false;
    // Skip the network round-trip (and a 404 in the logs) when public/ has no such file.
    const files = getStaticFiles();
    if (files.length && !files.some((f) => f.name === `captures/${id}.json`)) {
      setState({ status: 'missing' });
      continueRender(handle);
      return;
    }
    fetch(staticFile(`captures/${id}.json`))
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (!done) setState({ status: 'ready', timeline: normaliseTimeline(json), video: staticFile(`captures/${id}.webm`) });
      })
      .catch(() => {
        if (!done) setState({ status: 'missing' });
      })
      .finally(() => continueRender(handle));
    return () => {
      done = true;
    };
  }, [id, handle]);
  return state;
}

/**
 * Edit segments: which parts of the clip play, and how fast. Lets a shot trim the head/tail, cut out a splash
 * screen, or fast-forward typing. Clip seconds; rate defaults to 1. Played back to back.
 */
export type Segment = { from: number; to: number; rate?: number };

export type SegmentPlan = { from: number; to: number; rate: number; startFrame: number; frames: number }[];

export function planSegments(segments: Segment[], fps: number): SegmentPlan {
  let at = 0;
  return segments.map((s) => {
    const rate = s.rate ?? 1;
    const frames = Math.max(1, Math.round(((s.to - s.from) / rate) * fps));
    const p = { from: s.from, to: s.to, rate, startFrame: at, frames };
    at += frames;
    return p;
  });
}

export const planFrames = (plan: SegmentPlan) => plan.reduce((a, s) => a + s.frames, 0);

/** Shot-local frame → clip time (seconds). Past the end it holds the last segment's end. */
export function clipTimeAt(plan: SegmentPlan, frame: number, fps: number): number {
  if (!plan.length) return frame / fps;
  for (const s of plan) {
    if (frame < s.startFrame + s.frames) return s.from + (Math.max(0, frame - s.startFrame) / fps) * s.rate;
  }
  const last = plan[plan.length - 1];
  return last.to;
}

/** Clip time (seconds) → shot-local frame, using the first segment that contains it (NaN if cut out). */
export function frameAtClipTime(plan: SegmentPlan, t: number, fps: number): number {
  for (const s of plan) if (t >= s.from && t <= s.to) return s.startFrame + ((t - s.from) / s.rate) * fps;
  return NaN;
}

/** Like frameAtClipTime, but a time inside a cut maps to the start of the next segment (for camera keys). */
export function frameAtOrAfterClipTime(plan: SegmentPlan, t: number, fps: number): number {
  if (!plan.length) return t * fps;
  for (const s of plan) {
    if (t < s.from) return s.startFrame;
    if (t <= s.to) return s.startFrame + ((t - s.from) / s.rate) * fps;
  }
  return Infinity;
}

import { Easing } from 'remotion';
import { CaptureEvent } from './capture';

export type PathOpts = {
  /** seconds the pointer arrives before a click/type lands (default 0.14) */
  lead?: number;
  /** min / max travel time between targets (seconds) */
  minTravel?: number;
  maxTravel?: number;
  /** arc bow as a fraction of distance (default 0.07) */
  arc?: number;
  /** where the pointer sits before the first event (default: offset below-right of the first event) */
  start?: { x: number; y: number };
};

type Waypoint = { x: number; y: number; /** segment into this point starts */ depart: number; arrive: number; holdUntil: number };

const ease = Easing.bezier(0.42, 0, 0.12, 1);

export function buildWaypoints(events: CaptureEvent[], o: PathOpts = {}): Waypoint[] {
  const lead = o.lead ?? 0.14;
  const minT = o.minTravel ?? 0.3;
  const maxT = o.maxTravel ?? 0.85;
  const first = events[0];
  const start = o.start ?? (first ? { x: first.x + 160, y: first.y + 140 } : { x: 0, y: 0 });
  const pts: Waypoint[] = [{ x: start.x, y: start.y, depart: -1e9, arrive: -1e9, holdUntil: -1e9 }];
  for (const e of events) {
    const prev = pts[pts.length - 1];
    const dist = Math.hypot(e.x - prev.x, e.y - prev.y);
    const isPress = e.type === 'click' || e.type === 'type';
    let arrive = e.t - (isPress && dist > 2 ? lead : 0);
    const travel = Math.min(maxT, Math.max(minT, 0.26 + dist / 2400));
    const depart = Math.max(prev.holdUntil, arrive - travel);
    if (arrive - depart < 0.06) arrive = depart + 0.06;
    pts.push({ x: e.x, y: e.y, depart, arrive, holdUntil: Math.max(arrive, e.t + (isPress ? 0.1 : 0)) });
  }
  return pts;
}

/** Pointer position (viewport px) at clip time t. */
export function cursorAt(pts: Waypoint[], t: number, arc = 0.07): { x: number; y: number } {
  if (pts.length === 0) return { x: 0, y: 0 };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (t < b.arrive) {
      const d0 = b.depart;
      if (t <= d0) return { x: a.x, y: a.y };
      const p = ease(Math.min(1, (t - d0) / Math.max(0.001, b.arrive - d0)));
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const bow = Math.sin(Math.PI * p) * dist * arc;
      // perpendicular (bow consistently "up/left" relative to travel)
      const nx = dy / dist;
      const ny = -dx / dist;
      return { x: a.x + dx * p + nx * bow, y: a.y + dy * p + ny * bow };
    }
  }
  const last = pts[pts.length - 1];
  return { x: last.x, y: last.y };
}

/** Smoothed cursor position (for camera follow): average over a short trailing window. */
export function cursorSmoothed(pts: Waypoint[], t: number, windowSec = 0.5, samples = 9) {
  let x = 0;
  let y = 0;
  for (let i = 0; i < samples; i++) {
    const p = cursorAt(pts, t - (windowSec * i) / (samples - 1));
    x += p.x;
    y += p.y;
  }
  return { x: x / samples, y: y / samples };
}

import React, { useMemo } from 'react';
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Box, CaptureEvent } from '../lib/capture';
import { buildWaypoints, cursorSmoothed } from '../lib/cursorPath';
import { useShotClock } from '../lib/shotClock';
import { CAPTION_SAFE, VIDEO } from '../theme';
import { DeviceLayout } from './DeviceFrame';

/**
 * Camera keyframe. `t` is clip seconds (same clock as the capture timeline). Coordinates are viewport px of the
 * device screen. Each keyframe springs from wherever the camera is to its target over `duration` seconds.
 *  - { t, wide: true }                        → back to the full device shot
 *  - { t, x, y, zoom }                        → centre a point at a zoom
 *  - { t, region: {x,y,w,h}, zoom? }           → fit a region (zoom computed, capped by `zoom` / maxZoom)
 *  - { t, follow: true, zoom }                 → track the (smoothed) cursor until the next keyframe
 */
export type CameraKey = {
  t: number;
  zoom?: number;
  x?: number;
  y?: number;
  region?: Box;
  wide?: boolean;
  follow?: boolean;
  /** spring settle time in seconds (default 0.9) */
  duration?: number;
};

export type CameraProps = {
  layout: DeviceLayout;
  keyframes?: CameraKey[];
  /** events used for follow mode (defaults to the enclosing CaptureShot's timeline) */
  events?: CaptureEvent[];
  maxZoom?: number;
  /** keep the focus above the caption band when zoomed (default true) */
  captionSafe?: boolean;
  children: React.ReactNode;
};

type V = { lz: number; fx: number; fy: number };

const CX = VIDEO.width / 2;
const CY = VIDEO.height / 2;

export function cameraTransformAt(o: {
  frame: number;
  fps: number;
  frameOf: (t: number) => number;
  layout: DeviceLayout;
  keyframes: CameraKey[];
  follow?: (t: number) => { x: number; y: number };
  clipTime: number;
  maxZoom: number;
  captionSafe: boolean;
}) {
  const { layout: L } = o;
  const toStage = (x: number, y: number) => ({ x: L.screen.x + x * L.scale, y: L.screen.y + y * L.scale });
  const usableH = VIDEO.height - (o.captionSafe ? CAPTION_SAFE : 0);
  let v: V = { lz: 0, fx: CX, fy: CY };
  for (const k of o.keyframes) {
    const kf = o.frameOf(k.t);
    if (!Number.isFinite(kf) || o.frame < kf) continue;
    const p = spring({ frame: o.frame - kf, fps: o.fps, config: { damping: 200, mass: 1 }, durationInFrames: Math.max(1, Math.round((k.duration ?? 0.9) * o.fps)) });
    let target: V;
    if (k.wide) target = { lz: 0, fx: CX, fy: CY };
    else if (k.region) {
      const r = k.region;
      const fit = Math.min((VIDEO.width * 0.82) / (r.w * L.scale), (usableH * 0.8) / (r.h * L.scale));
      const z = Math.min(k.zoom ?? o.maxZoom, o.maxZoom, Math.max(1, fit));
      const c = toStage(r.x + r.w / 2, r.y + r.h / 2);
      target = { lz: Math.log(z), fx: c.x, fy: c.y };
    } else if (k.follow && o.follow) {
      const c0 = o.follow(o.clipTime);
      const c = toStage(c0.x, c0.y);
      target = { lz: Math.log(k.zoom ?? 1.5), fx: c.x, fy: c.y };
    } else {
      const c = toStage(k.x ?? L.viewport.w / 2, k.y ?? L.viewport.h / 2);
      target = { lz: Math.log(k.zoom ?? 1.5), fx: c.x, fy: c.y };
    }
    v = { lz: v.lz + (target.lz - v.lz) * p, fx: v.fx + (target.fx - v.fx) * p, fy: v.fy + (target.fy - v.fy) * p };
  }
  const z = Math.exp(v.lz);
  // Blend from identity (z = 1) to "focus at the usable-centre, clamped to the device" as we zoom.
  const w = Math.min(1, (z - 1) / 0.25);
  const targetCy = CY + ((usableH / 2) - CY) * w;
  // Clamp focus so the window stays on the device (+ a little margin)
  const halfW = CX / z;
  const halfAbove = targetCy / z;
  const halfBelow = (VIDEO.height - targetCy) / z;
  const m = 60;
  const ox0 = L.outer.x - m, ox1 = L.outer.x + L.outer.w + m;
  const oy0 = L.outer.y - m, oy1 = L.outer.y + L.outer.h + m;
  const clamp = (val: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, val)));
  const fx = v.fx + (clamp(v.fx, ox0 + halfW, ox1 - halfW) - v.fx) * w;
  const fy = v.fy + (clamp(v.fy, oy0 + halfAbove, oy1 - halfBelow) - v.fy) * w;
  return { z, fx, fy, cy: targetCy, transform: `translate(${CX}px, ${targetCy}px) scale(${z}) translate(${-fx}px, ${-fy}px)` };
}

export const Camera: React.FC<CameraProps> = ({ layout, keyframes = [], events, maxZoom = 2.2, captionSafe = true, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const clock = useShotClock();
  const evs = events ?? clock?.timeline?.events ?? [];
  const pts = useMemo(() => buildWaypoints(evs), [evs]);
  const nowF = clock ? clock.frame : frame;
  const frameOf = clock ? clock.frameAfter : (s: number) => s * fps;
  const clipTime = clock ? clock.clipTime : frame / fps;
  const sorted = useMemo(() => [...keyframes].sort((a, b) => a.t - b.t), [keyframes]);
  const { transform } = cameraTransformAt({
    frame: nowF,
    fps,
    frameOf,
    layout,
    keyframes: sorted,
    follow: evs.length ? (t) => cursorSmoothed(pts, t, 0.6) : undefined,
    clipTime,
    maxZoom,
    captionSafe,
  });
  return <AbsoluteFill style={{ transform, transformOrigin: '0 0' }}>{children}</AbsoluteFill>;
};

/**
 * Generate a sensible camera from the click list: start wide, push in ~0.6 s before each click cluster, ease back
 * out before the shot ends. Good default; hand-written keyframes override it.
 */
export function autoCamera(events: CaptureEvent[], o: { zoom?: number; endSec?: number; startSec?: number; follow?: boolean } = {}): CameraKey[] {
  const zoom = o.zoom ?? 1.5;
  const keys: CameraKey[] = [{ t: o.startSec ?? 0, wide: true, duration: 0.01 }];
  let lastT = -1e9;
  let last: CaptureEvent | null = null;
  for (const e of events) {
    if (e.type !== 'click' && e.type !== 'hover') continue;
    const near = last && Math.hypot(e.x - last.x, e.y - last.y) < 260 && e.t - lastT < 2.5;
    if (near) continue;
    keys.push(o.follow ? { t: Math.max(0, e.t - 0.7), follow: true, zoom } : e.box && e.type === 'hover' ? { t: Math.max(0, e.t - 0.7), region: e.box, zoom } : { t: Math.max(0, e.t - 0.7), x: e.x, y: e.y, zoom });
    lastT = e.t;
    last = e;
  }
  if (o.endSec !== undefined) keys.push({ t: Math.max(lastT + 0.6, o.endSec - 1.0), wide: true, duration: 0.8 });
  return keys;
}

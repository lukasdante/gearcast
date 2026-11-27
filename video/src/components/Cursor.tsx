import React, { useMemo } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptureEvent, CaptureTimeline } from '../lib/capture';
import { buildWaypoints, cursorAt, PathOpts } from '../lib/cursorPath';
import { useShotClock } from '../lib/shotClock';
import { COLORS } from '../theme';
import { useScreen } from './DeviceFrame';

export type CursorProps = {
  /** capture timeline (defaults to the enclosing CaptureShot's) */
  timeline?: CaptureTimeline;
  /** or raw events */
  events?: CaptureEvent[];
  /** 'arrow' (laptop), 'touch' (finger dot), 'auto' = touch on phone/tablet */
  variant?: 'arrow' | 'touch' | 'auto';
  /** on-screen size in output px at camera zoom 1 (arrow height ≈ size) */
  size?: number;
  color?: string;
  /** ripple / glow colour */
  accent?: string;
  path?: PathOpts;
  /** draw a glow ring around event.box on click (the video "pop" itself is done by CaptureShot) */
  boxGlow?: boolean;
  /** fade the arrow in this many seconds before the first event (default: always visible) */
  fadeInBeforeFirst?: number;
};

const ARROW_PATH = 'M2 1.5 L2 25.5 L8.3 19.6 L12.4 29 L16.6 27.2 L12.6 18 L21.2 18 Z';

/**
 * Pointer overlay, rendered inside the device screen slot (viewport px). Time comes from the ShotClock (clip time
 * of the video on screen), so the path stays locked to the footage across trims / speed ramps.
 */
export const Cursor: React.FC<CursorProps> = ({ timeline, events, variant = 'auto', size, color = '#ffffff', accent = COLORS.accent, path, boxGlow = true, fadeInBeforeFirst }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const clock = useShotClock();
  const screen = useScreen();
  const evs = useMemo(() => events ?? timeline?.events ?? clock?.timeline?.events ?? [], [events, timeline, clock?.timeline]);
  const pts = useMemo(() => buildWaypoints(evs, path), [evs, path]);
  const t = clock ? clock.clipTime : frame / fps;
  const nowF = clock ? clock.frame : frame;
  const frameOf = clock ? clock.frameOf : (s: number) => s * fps;
  const kind = variant === 'auto' ? (screen.device === 'laptop' ? 'arrow' : 'touch') : variant;
  const k = 1 / screen.scale; // output px → viewport px
  if (!evs.length) return null;

  // Effects (in shot frames so they keep their timing through speed ramps)
  const presses = evs.filter((e) => e.type === 'click');
  let squish = 1;
  const ripples: React.ReactNode[] = [];
  presses.forEach((e, i) => {
    const ef = frameOf(e.t);
    if (!Number.isFinite(ef)) return;
    const d = nowF - ef;
    if (d >= -4 && d < 0) squish = Math.min(squish, interpolate(d, [-4, 0], [1, 0.74]));
    if (d >= 0 && d < 30) {
      const s = spring({ frame: d, fps, config: { damping: 7, stiffness: 260, mass: 0.55 } });
      squish = Math.min(squish, 0.74 + 0.26 * s);
      if (d < 22) {
        for (const [delay, maxR, w] of [[0, 46, 3], [4, 70, 2]] as const) {
          const dd = d - delay;
          if (dd < 0) continue;
          const p = interpolate(dd, [0, 18], [0, 1], { extrapolateRight: 'clamp' });
          const r = (8 + (maxR - 8) * (1 - (1 - p) ** 3)) * k;
          ripples.push(
            <div key={`r${i}-${delay}`} style={{ position: 'absolute', left: e.x - r, top: e.y - r, width: 2 * r, height: 2 * r, borderRadius: '50%', border: `${w * k}px solid ${accent}`, opacity: (1 - p) * 0.95, boxShadow: `0 0 ${14 * k}px ${accent}` }} />,
          );
        }
        if (d < 8) {
          const r = interpolate(d, [0, 8], [10, 22]) * k;
          ripples.push(<div key={`f${i}`} style={{ position: 'absolute', left: e.x - r, top: e.y - r, width: 2 * r, height: 2 * r, borderRadius: '50%', background: accent, opacity: interpolate(d, [0, 8], [0.55, 0]) }} />);
        }
      }
      if (boxGlow && e.box && d < 26) {
        const p = interpolate(d, [0, 6, 26], [0, 1, 0], { extrapolateRight: 'clamp' });
        const pad = 6 * k;
        ripples.push(
          <div key={`b${i}`} style={{ position: 'absolute', left: e.box.x - pad, top: e.box.y - pad, width: e.box.w + 2 * pad, height: e.box.h + 2 * pad, borderRadius: 10 * k, border: `${2.5 * k}px solid ${accent}`, boxShadow: `0 0 ${24 * k}px ${accent}, inset 0 0 ${16 * k}px rgba(47,208,193,0.25)`, opacity: p }} />,
        );
      }
    }
  });

  // Scroll hint chevrons (arrow) / drag (touch)
  const scrolls = evs.filter((e) => e.type === 'scroll');

  if (kind === 'touch') {
    // Finger dot visible around each press / drag.
    const dots: React.ReactNode[] = [];
    const R = (size ?? 30) * k;
    presses.forEach((e, i) => {
      const ef = frameOf(e.t);
      if (!Number.isFinite(ef)) return;
      const d = nowF - ef;
      if (d < -8 || d > 12) return;
      const op = interpolate(d, [-8, -3, 6, 12], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const sc = d < 0 ? interpolate(d, [-8, 0], [1.25, 0.82]) : 0.82 + 0.18 * spring({ frame: d, fps, config: { damping: 9, stiffness: 240 } });
      dots.push(<FingerDot key={`t${i}`} x={e.x} y={e.y} r={R * sc} opacity={op} />);
    });
    scrolls.forEach((e, i) => {
      const ef = frameOf(e.t);
      if (!Number.isFinite(ef)) return;
      const d = nowF - ef;
      if (d < -6 || d > 18) return;
      const travel = Math.min(320, Math.abs(e.dy ?? 400) * 0.45) * Math.sign(e.dy ?? 1);
      const p = interpolate(d, [-2, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const op = interpolate(d, [-6, -1, 12, 18], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const y = e.y + travel / 2 - travel * (1 - (1 - p) ** 2);
      dots.push(<FingerDot key={`s${i}`} x={e.x} y={y} r={R * 0.9} opacity={op} />);
    });
    return (
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {ripples}
        {dots}
      </div>
    );
  }

  const pos = cursorAt(pts, t);
  const prev = cursorAt(pts, t - 1 / fps);
  const vx = (pos.x - prev.x) * screen.scale; // output px / frame
  const lean = Math.max(-10, Math.min(10, vx * 0.35));
  const H = (size ?? 34) * k;
  const firstT = evs[0].t;
  const vis = fadeInBeforeFirst ? interpolate(t, [firstT - fadeInBeforeFirst, firstT - fadeInBeforeFirst + 0.25], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
  const scrollHint = scrolls
    .map((e) => {
      const ef = frameOf(e.t);
      const d = nowF - ef;
      if (!Number.isFinite(ef) || d < 0 || d > 20) return null;
      const dir = Math.sign(e.dy ?? 1);
      const op = interpolate(d, [0, 4, 14, 20], [0, 1, 1, 0]);
      const off = interpolate(d, [0, 20], [0, 14]) * dir;
      return (
        <svg key={`sc${e.t}`} width={22 * k} height={36 * k} viewBox="0 0 22 36" style={{ position: 'absolute', left: pos.x + 26 * k, top: pos.y + (6 + off) * k, opacity: op }}>
          <path d={dir > 0 ? 'M4 8 L11 15 L18 8 M4 20 L11 27 L18 20' : 'M4 15 L11 8 L18 15 M4 27 L11 20 L18 27'} fill="none" stroke={accent} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    })
    .filter(Boolean);

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: vis }}>
      {ripples}
      {scrollHint}
      <svg
        width={(H * 24) / 30}
        height={H}
        viewBox="0 0 24 30"
        style={{
          position: 'absolute',
          left: pos.x - (2 / 30) * H,
          top: pos.y - (1.5 / 30) * H,
          overflow: 'visible',
          transformOrigin: `${(2 / 24) * 100}% ${(1.5 / 30) * 100}%`,
          transform: `rotate(${lean}deg) scale(${squish}, ${squish * (squish < 1 ? 0.96 : 1)})`,
          filter: `drop-shadow(0 ${3 * k}px ${5 * k}px rgba(0,0,0,0.55))`,
        }}
      >
        <path d={ARROW_PATH} fill={color} stroke="#0b0f14" strokeWidth={1.6} strokeLinejoin="round" />
      </svg>
    </div>
  );
};

const FingerDot: React.FC<{ x: number; y: number; r: number; opacity: number }> = ({ x, y, r, opacity }) => (
  <div
    style={{
      position: 'absolute',
      left: x - r,
      top: y - r,
      width: 2 * r,
      height: 2 * r,
      borderRadius: '50%',
      opacity,
      background: 'radial-gradient(circle at 40% 35%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.75) 45%, rgba(230,235,242,0.55) 100%)',
      border: `${r * 0.08}px solid rgba(255,255,255,0.9)`,
      boxShadow: `0 ${r * 0.25}px ${r * 0.8}px rgba(0,0,0,0.45), 0 0 0 ${r * 0.3}px rgba(47,208,193,0.25)`,
    }}
  />
);

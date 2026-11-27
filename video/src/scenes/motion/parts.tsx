/** Shared SVG primitives for the motion scenes: GearCast mark, pump glyph, tank, flowing pipe, alarm rings. */
import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT, MONO } from './theme';

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Gear outline used in the app's top bar (24-unit viewBox). */
export const GEAR_D =
  'M12 2.5l2 2.6 3.2-.6.6 3.2 2.7 1.9-1.4 3 1.4 3-2.7 1.9-.6 3.2-3.2-.6-2 2.6-2-2.6-3.2.6-.6-3.2L3.5 15.4l1.4-3-1.4-3 2.7-1.9.6-3.2 3.2.6z';

/**
 * GearCast logo: the top-bar gear mark in its tinted rounded tile + "Gear**Cast**" wordmark.
 * `reveal` 0→1 draws the gear stroke, pops the hub, then slides the wordmark in.
 */
export function GearCastLogo({ size = 120, reveal = 1, spin = 0, wordmark = true, glow = 1 }:
  { size?: number; reveal?: number; spin?: number; wordmark?: boolean; glow?: number }) {
  const draw = interpolate(reveal, [0, 0.55], [0, 1], clamp);
  const hub = interpolate(reveal, [0.35, 0.6], [0, 1], clamp);
  const tile = interpolate(reveal, [0, 0.3], [0, 1], clamp);
  const word = interpolate(reveal, [0.5, 1], [0, 1], clamp);
  const len = 80;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.32 }}>
      <div style={{
        width: size, height: size, borderRadius: size * 0.25, display: 'grid', placeItems: 'center',
        background: `rgba(47,208,193,${0.14 * tile})`, border: `${Math.max(1.5, size / 50)}px solid rgba(47,208,193,${0.3 * tile})`,
        boxShadow: `0 0 ${size * 0.6 * glow}px rgba(47,208,193,${0.28 * glow * tile})`,
        transform: `scale(${0.7 + 0.3 * tile})`,
      }}>
        <svg viewBox="0 0 24 24" width={size * 0.66} height={size * 0.66} style={{ overflow: 'visible', transform: `rotate(${spin}deg)` }}>
          <path d={GEAR_D} fill="none" stroke={C.accent} strokeWidth={1.6} strokeLinejoin="round"
            strokeDasharray={len} strokeDashoffset={len * (1 - draw)} />
          <circle cx={12} cy={12} r={3.2 * hub} fill={C.accent} />
        </svg>
      </div>
      {wordmark && (
        <div style={{
          fontFamily: FONT, fontSize: size * 0.62, letterSpacing: '-0.02em', lineHeight: 1, whiteSpace: 'nowrap',
          clipPath: `inset(-20% ${100 - word * 100}% -20% 0)`, transform: `translateX(${(1 - word) * -size * 0.3}px)`,
        }}>
          <span style={{ fontWeight: 500, color: C.text2 }}>Gear</span>
          <span style={{ fontWeight: 800, color: C.text }}>Cast</span>
        </div>
      )}
    </div>
  );
}

/** Small status chip drawn in SVG, centred on x=0. */
export function Chip({ text, color, w = 130, y = 0, solid = false }: { text: string; color: string; w?: number; y?: number; solid?: boolean }) {
  return (
    <g transform={`translate(0 ${y})`}>
      <rect x={-w / 2} y={0} width={w} height={28} rx={14} fill={solid ? color : `${color}22`} stroke={`${color}88`} />
      <text x={0} y={19} textAnchor="middle" fill={solid ? '#0b0f14' : color} style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, letterSpacing: '0.08em' }}>{text}</text>
    </g>
  );
}

/** Pipe with animated flow dashes; `offset` is the integrated flow distance (px), `flow` 0..1 fades the dashes. */
export function Pipe({ d, offset, flow, color = C.accent, width = 14 }: { d: string; offset: number; flow: number; color?: string; width?: number }) {
  return (
    <g>
      <path d={d} fill="none" stroke="#1f2a38" strokeWidth={width + 6} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke="#0f1620" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={color} strokeWidth={width * 0.42} strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="3 26" strokeDashoffset={-offset} opacity={0.9 * flow} />
    </g>
  );
}

/** Expanding alarm rings that restart every `period` frames from `start`. */
export function AlarmRings({ x, y, start, period = 24, color = C.fault, r0 = 50, r1 = 150 }:
  { x: number; y: number; start: number; period?: number; color?: string; r0?: number; r1?: number }) {
  const frame = useCurrentFrame();
  if (frame < start) return null;
  const rings = [0, 1, 2].map(i => {
    const t = ((frame - start + i * (period / 3)) % period) / period;
    return <circle key={i} cx={x} cy={y} r={r0 + (r1 - r0) * t} fill="none" stroke={color} strokeWidth={3 * (1 - t)} opacity={(1 - t) * 0.8} />;
  });
  return <g>{rings}</g>;
}

/** Spring helper: 0→1 starting at frame `at`. */
export function useSpringAt(at: number, cfg: { damping?: number; stiffness?: number; mass?: number } = {}, durationInFrames?: number) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - at, fps, config: { damping: 14, stiffness: 160, mass: 0.8, ...cfg }, durationInFrames });
}

/** Shared SVG defs (blur, grid pattern, vignette). Put once inside each scene <svg>. */
export function MotionDefs() {
  return (
    <defs>
      <filter id="mg-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={18} /></filter>
      <filter id="mg-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation={6} /></filter>
      <pattern id="mg-grid" width={48} height={48} patternUnits="userSpaceOnUse">
        <path d="M48 0H0V48" fill="none" stroke="rgba(160,180,205,0.055)" strokeWidth={1} />
      </pattern>
      <radialGradient id="mg-vig" cx="50%" cy="45%" r="75%">
        <stop offset="55%" stopColor="#000" stopOpacity={0} />
        <stop offset="100%" stopColor="#000" stopOpacity={0.75} />
      </radialGradient>
      <linearGradient id="mg-water" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2a7f86" />
        <stop offset="1" stopColor="#123c45" />
      </linearGradient>
    </defs>
  );
}

/** Pump with the volute on the left (suction into the eye), motor on the right; anchored at the volute centre. */
export function PumpR({ x, y, angle, color, glow = 0, label, sub }:
  { x: number; y: number; angle: number; color: string; glow?: number; label: string; sub?: React.ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {glow > 0 && <circle cx={40} r={95} fill={color} opacity={0.2 * glow} filter="url(#mg-blur)" />}
      <rect x={-56} y={44} width={200} height={12} rx={3} fill={C.panel3} stroke={C.line2} />
      <rect x={40} y={-11} width={26} height={24} rx={3} fill={C.panel3} stroke={C.line2} />
      <rect x={66} y={-32} width={72} height={66} rx={8} fill={C.panel2} stroke={C.line2} strokeWidth={1.5} />
      {[-18, -6, 6, 18].map(dy => <line key={dy} x1={74} x2={130} y1={dy} y2={dy} stroke={C.line2} strokeWidth={2} />)}
      <rect x={-12} y={-58} width={24} height={20} rx={3} fill={C.panel} stroke={color} strokeWidth={2.5} />
      <circle r={40} fill={C.panel} stroke={color} strokeWidth={3.5} />
      <g transform={`rotate(${angle})`}>
        {[0, 72, 144, 216, 288].map(a => (
          <path key={a} d="M0 0 C 8 -8, 22 -10, 30 -4" fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" transform={`rotate(${a})`} />
        ))}
        <circle r={7} fill={color} />
      </g>
      <text x={42} y={94} textAnchor="middle" fill={C.text} style={{ fontFamily: MONO, fontWeight: 700, fontSize: 26 }}>{label}</text>
      {sub && <g transform="translate(42 108)">{sub}</g>}
    </g>
  );
}

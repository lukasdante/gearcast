import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { CAST, CastKey, COLORS, FONT, MONO, Person, ROLE_COLORS, SAFE } from '../theme';

/** 0→1 enter spring at `at`, 1→0 exit at `until` (seconds, relative to the enclosing Sequence). */
export function useInOut(at: number, until?: number, cfg = { damping: 14, stiffness: 170, mass: 0.7 }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - at * fps, fps, config: cfg });
  const exit = until === undefined ? 0 : spring({ frame: frame - until * fps, fps, config: { damping: 200 }, durationInFrames: 10 });
  return { enter, exit, v: Math.max(0, enter - exit), started: frame >= at * fps };
}

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
const cornerStyle = (c: Corner, offsetY = 0): React.CSSProperties => ({
  position: 'absolute',
  ...(c.includes('top') ? { top: SAFE.y + offsetY } : { bottom: 250 + offsetY }),
  ...(c.includes('left') ? { left: SAFE.x } : { right: SAFE.x }),
});

export type RoleBadgeProps = {
  /** cast key ("mia") or a Person */
  who: CastKey | Person;
  /** enter time (s) */
  at?: number;
  /** exit time (s) */
  until?: number;
  corner?: Corner;
  /** stack offset (px) when several badges share a corner */
  offsetY?: number;
  /** smaller variant */
  compact?: boolean;
};

/** "Mia · Technician · MT-01" pill with role colour and avatar initial. */
export const RoleBadge: React.FC<RoleBadgeProps> = ({ who, at = 0.2, until, corner = 'top-right', offsetY = 0, compact }) => {
  const p: Person = typeof who === 'string' ? CAST[who] : who;
  const { v, started } = useInOut(at, until);
  if (!started || v <= 0.001) return null;
  const c = ROLE_COLORS[p.role];
  const s = compact ? 0.8 : 1;
  const fromRight = corner.includes('right');
  return (
    <div
      style={{
        ...cornerStyle(corner, offsetY),
        display: 'flex',
        alignItems: 'center',
        gap: 14 * s,
        padding: `${10 * s}px ${22 * s}px ${10 * s}px ${10 * s}px`,
        borderRadius: 999,
        background: 'rgba(14,19,26,0.88)',
        border: `1.5px solid color-mix(in srgb, ${c} 45%, transparent)`,
        boxShadow: `0 14px 36px rgba(0,0,0,0.45), 0 0 0 6px color-mix(in srgb, ${c} 8%, transparent)`,
        fontFamily: FONT,
        opacity: Math.min(1, v * 1.4),
        transform: `translateX(${(1 - v) * (fromRight ? 60 : -60)}px) scale(${0.85 + 0.15 * v})`,
        transformOrigin: fromRight ? '100% 50%' : '0 50%',
      }}
    >
      <div style={{ width: 46 * s, height: 46 * s, borderRadius: '50%', display: 'grid', placeItems: 'center', background: `linear-gradient(140deg, ${c}, color-mix(in srgb, ${c} 55%, #0b0f14))`, color: '#0b0f14', fontWeight: 800, fontSize: 22 * s }}>
        {p.name[0]}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 * s, whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 26 * s, fontWeight: 800, color: COLORS.text }}>{p.name}</span>
        <span style={{ fontSize: 20 * s, color: c, fontWeight: 700 }}>{p.title ?? p.role}</span>
        <span style={{ fontSize: 17 * s, color: COLORS.text2, fontFamily: MONO, padding: `${2 * s}px ${8 * s}px`, borderRadius: 6, border: `1px solid ${COLORS.line2}` }}>{p.account}</span>
      </div>
    </div>
  );
};

export type SceneTitleProps = {
  /** a single label, or a label sequence [{at, label}] (chip morphs between them) */
  label?: string;
  labels?: { at: number; label: string }[];
  at?: number;
  until?: number;
  corner?: Corner;
  color?: string;
};

/** Small feature chip, top-left: "QR scan". */
export const SceneTitle: React.FC<SceneTitleProps> = ({ label, labels, at, until, corner = 'top-left', color = COLORS.accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seq = labels ?? (label ? [{ at: at ?? 0.15, label }] : []);
  const start = at ?? seq[0]?.at ?? 0;
  const { v, started } = useInOut(start, until);
  if (!started || !seq.length || v <= 0.001) return null;
  const t = frame / fps;
  let cur = 0;
  seq.forEach((s, i) => {
    if (t >= s.at) cur = i;
  });
  const swap = cur > 0 ? spring({ frame: frame - seq[cur].at * fps, fps, config: { damping: 13, stiffness: 200 } }) : 1;
  return (
    <div
      style={{
        ...cornerStyle(corner),
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 20px 11px 16px',
        borderRadius: 12,
        background: 'rgba(14,19,26,0.85)',
        border: `1.5px solid color-mix(in srgb, ${color} 40%, transparent)`,
        boxShadow: '0 12px 30px rgba(0,0,0,0.4)',
        fontFamily: FONT,
        opacity: Math.min(1, v * 1.4),
        transform: `translateY(${(1 - v) * -24}px)`,
      }}
    >
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 0 5px color-mix(in srgb, ${color} 22%, transparent)` }} />
      <div style={{ fontSize: 23, fontWeight: 700, color: COLORS.text, letterSpacing: '0.01em', whiteSpace: 'nowrap', opacity: swap, transform: `translateY(${(1 - swap) * 10}px)` }}>{seq[cur].label}</div>
    </div>
  );
};

export type ApprovalToastProps = {
  /** "Approved by Lemuel" */
  by: string;
  role?: string;
  /** headline verb (default "Approved") */
  verb?: string;
  detail?: string;
  at?: number;
  /** seconds visible (default 2.4) */
  hold?: number;
  color?: string;
  corner?: Corner;
  /** px below the corner's safe edge (default 84 at the top: clears a RoleBadge) */
  offsetY?: number;
};

/** Pops in with a drawn check: "Approved by Lemuel · Supervisor". */
export const ApprovalToast: React.FC<ApprovalToastProps> = ({ by, role, verb = 'Approved', detail, at = 0, hold = 2.4, color = COLORS.running, corner = 'top-right', offsetY }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { v, started } = useInOut(at, at + hold, { damping: 11, stiffness: 190, mass: 0.7 });
  if (!started || v <= 0.001) return null;
  const f = frame - at * fps;
  const check = interpolate(f, [5, 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ring = interpolate(f, [3, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fromRight = corner.includes('right');
  return (
    <div
      style={{
        ...cornerStyle(corner, offsetY ?? (corner.includes('top') ? 84 : 0)),
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        padding: '18px 30px 18px 18px',
        borderRadius: 18,
        background: 'rgba(14,19,26,0.94)',
        border: `1.5px solid color-mix(in srgb, ${color} 50%, transparent)`,
        boxShadow: `0 22px 50px rgba(0,0,0,0.5), 0 0 40px color-mix(in srgb, ${color} 18%, transparent)`,
        fontFamily: FONT,
        opacity: Math.min(1, v * 1.5),
        transform: `translateX(${(1 - v) * (fromRight ? 80 : -80)}px) scale(${0.8 + 0.2 * v})`,
        transformOrigin: fromRight ? '100% 50%' : '0 50%',
      }}
    >
      <div style={{ position: 'relative', width: 58, height: 58 }}>
        <div style={{ position: 'absolute', inset: -10 * ring, borderRadius: '50%', border: `2px solid ${color}`, opacity: 1 - ring }} />
        <svg width={58} height={58} viewBox="0 0 58 58">
          <circle cx={29} cy={29} r={27} fill={color} />
          <path d="M17 30 L25.5 38.5 L41.5 21.5" fill="none" stroke="#0b0f14" strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={40} strokeDashoffset={40 * (1 - check)} />
        </svg>
      </div>
      <div style={{ whiteSpace: 'nowrap' }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: COLORS.text }}>
          {verb} by <span style={{ color }}>{by}</span>
          {role && <span style={{ color: COLORS.text2, fontWeight: 600 }}> · {role}</span>}
        </div>
        {detail && <div style={{ fontSize: 19, color: COLORS.text2, marginTop: 3, fontFamily: MONO }}>{detail}</div>}
      </div>
    </div>
  );
};

/** Full-frame layer for overlays (so they sit above device shots without inheriting camera transforms). */
export const OverlayLayer: React.FC<{ children: React.ReactNode }> = ({ children }) => <AbsoluteFill style={{ pointerEvents: 'none' }}>{children}</AbsoluteFill>;

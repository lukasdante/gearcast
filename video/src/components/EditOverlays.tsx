import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Box } from '../lib/capture';
import { useShotClock } from '../lib/shotClock';
import { COLORS, FONT, SAFE } from '../theme';
import { useInOut } from './Overlays';

export type HighlightSpec = { t: number; until?: number; box: Box; color?: string; pad?: number; radius?: number };

/**
 * Editor highlight rings, drawn inside a device screen (viewport px), timed on the capture clock (clip seconds), so
 * they stay locked to the footage through trims / speed ramps. Pass as CaptureShot `screenOverlay`.
 */
export const Highlights: React.FC<{ items: HighlightSpec[] }> = ({ items }) => {
  const clock = useShotClock();
  const { fps } = useVideoConfig();
  if (!clock) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {items.map((h, i) => {
        const f0 = clock.frameAfter(h.t);
        if (!Number.isFinite(f0) || clock.frame < f0) return null;
        const d = clock.frame - f0;
        const fEnd = h.until !== undefined ? clock.frameAfter(h.until) : Infinity;
        const out = Number.isFinite(fEnd) ? interpolate(clock.frame, [fEnd, fEnd + 8], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
        if (out <= 0) return null;
        const p = spring({ frame: d, fps, config: { damping: 14, stiffness: 160 } });
        const pulse = 0.5 + 0.5 * Math.cos((d / fps) * Math.PI * 1.6);
        const c = h.color ?? COLORS.accent;
        const pad = h.pad ?? 8;
        const r = h.radius ?? 10;
        const s = 1.25 - 0.25 * p;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: h.box.x - pad,
              top: h.box.y - pad,
              width: h.box.w + 2 * pad,
              height: h.box.h + 2 * pad,
              borderRadius: r,
              border: `4px solid ${c}`,
              boxShadow: `0 0 ${18 + 14 * pulse}px ${c}, inset 0 0 ${16}px color-mix(in srgb, ${c} 30%, transparent)`,
              background: `color-mix(in srgb, ${c} ${8 + 5 * pulse}%, transparent)`,
              opacity: Math.min(1, p * 1.5) * out,
              transform: `scale(${s})`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** White camera "snap" flash inside the screen at clip time `t`. */
export const SnapFlash: React.FC<{ t: number }> = ({ t }) => {
  const clock = useShotClock();
  if (!clock) return null;
  const f0 = clock.frameAfter(t);
  const d = clock.frame - f0;
  if (!Number.isFinite(f0) || d < 0 || d > 7) return null;
  const op = interpolate(d, [0, 1, 7], [0, 0.7, 0], { extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ background: '#fff', opacity: op, pointerEvents: 'none' }} />;
};

export type CalloutProps = { at: number; until?: number; text: string; sub?: string; color?: string; icon?: 'check' | 'clock' | 'bolt'; offsetY?: number; corner?: 'top-right' | 'top-left' };

/** Status chip for app moments that have no on-screen confirmation ("Accessory · deployed instantly"). */
export const Callout: React.FC<CalloutProps> = ({ at, until, text, sub, color = COLORS.running, icon = 'check', offsetY = 84, corner = 'top-right' }) => {
  const { v, started } = useInOut(at, until, { damping: 12, stiffness: 190, mass: 0.7 });
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!started || v <= 0.001) return null;
  const draw = interpolate(frame - at * fps, [4, 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const right = corner === 'top-right';
  return (
    <div
      style={{
        position: 'absolute',
        top: SAFE.y + offsetY,
        ...(right ? { right: SAFE.x } : { left: SAFE.x }),
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '14px 26px 14px 16px',
        borderRadius: 16,
        background: 'rgba(14,19,26,0.94)',
        border: `1.5px solid color-mix(in srgb, ${color} 55%, transparent)`,
        boxShadow: `0 18px 44px rgba(0,0,0,0.5), 0 0 34px color-mix(in srgb, ${color} 18%, transparent)`,
        fontFamily: FONT,
        opacity: Math.min(1, v * 1.5),
        transform: `translateX(${(1 - v) * (right ? 70 : -70)}px) scale(${0.85 + 0.15 * v})`,
        transformOrigin: right ? '100% 50%' : '0 50%',
        whiteSpace: 'nowrap',
      }}
    >
      <svg width={46} height={46} viewBox="0 0 46 46">
        <circle cx={23} cy={23} r={22} fill={color} />
        {icon === 'check' && <path d="M13 24 L20 31 L33 16" fill="none" stroke="#0b0f14" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={34} strokeDashoffset={34 * (1 - draw)} />}
        {icon === 'clock' && (
          <g fill="none" stroke="#0b0f14" strokeWidth={4.5} strokeLinecap="round">
            <circle cx={23} cy={23} r={12} />
            <path d={`M23 23 L23 ${23 - 8 * draw} M23 23 L${23 + 6 * draw} 23`} />
          </g>
        )}
        {icon === 'bolt' && <path d="M25 9 L14 26 L22 26 L20 37 L32 20 L24 20 Z" fill="#0b0f14" opacity={draw} />}
      </svg>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: COLORS.text }}>
          {text.split(' · ')[0]}
          {text.includes(' · ') && <span style={{ color, fontWeight: 700 }}> · {text.split(' · ').slice(1).join(' · ')}</span>}
        </div>
        {sub && <div style={{ fontSize: 18, color: COLORS.text2, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
};

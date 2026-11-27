import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { COLORS } from '../theme';

export type BackgroundProps = {
  /** 'brand' = teal/blue glow (default), 'dark' = muted (hook), 'alert' = red-tinted */
  variant?: 'brand' | 'dark' | 'alert';
  /** 0..1 grid visibility */
  grid?: number;
  /** optional frame offset so a scene can keep continuity */
  frameOffset?: number;
};

const TINTS = {
  brand: ['rgba(47,208,193,0.20)', 'rgba(75,157,255,0.16)', 'rgba(47,208,193,0.08)'],
  dark: ['rgba(47,208,193,0.06)', 'rgba(75,157,255,0.05)', 'rgba(20,30,40,0.0)'],
  alert: ['rgba(240,82,82,0.16)', 'rgba(242,181,59,0.07)', 'rgba(240,82,82,0.05)'],
};

/** Branded stage: deep navy, two slow-drifting glows, a perspective grid that creeps forward, vignette. */
export const Background: React.FC<BackgroundProps> = ({ variant = 'brand', grid = 1, frameOffset = 0 }) => {
  const f = useCurrentFrame() + frameOffset;
  const [a, b, c] = TINTS[variant];
  const ax = 22 + Math.sin(f / 140) * 8;
  const ay = 18 + Math.cos(f / 170) * 6;
  const bx = 80 + Math.cos(f / 160) * 7;
  const by = 78 + Math.sin(f / 130) * 6;
  const gridShift = (f * 0.6) % 80;
  return (
    <AbsoluteFill style={{ background: COLORS.bg, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 700px at ${ax}% ${ay}%, ${a}, transparent 70%), radial-gradient(1000px 800px at ${bx}% ${by}%, ${b}, transparent 70%), radial-gradient(1400px 900px at 50% 120%, ${c}, transparent 70%)`,
        }}
      />
      {grid > 0 && (
        <AbsoluteFill style={{ perspective: 900, perspectiveOrigin: '50% 30%', opacity: 0.55 * grid }}>
          <div
            style={{
              position: 'absolute',
              left: '-50%',
              width: '200%',
              top: '48%',
              height: '120%',
              transform: 'rotateX(72deg)',
              transformOrigin: '50% 0',
              backgroundImage: `linear-gradient(rgba(120,170,200,0.13) 1.5px, transparent 1.5px), linear-gradient(90deg, rgba(120,170,200,0.13) 1.5px, transparent 1.5px)`,
              backgroundSize: '80px 80px',
              backgroundPosition: `0 ${gridShift}px`,
              maskImage: 'linear-gradient(180deg, transparent 0%, black 25%, black 60%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, black 25%, black 60%, transparent 100%)',
            }}
          />
          {/* faint flat dot grid on the upper half */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'radial-gradient(rgba(160,180,205,0.10) 1.2px, transparent 1.4px)',
              backgroundSize: '32px 32px',
              backgroundPosition: `${(f * 0.15) % 32}px 0`,
              maskImage: 'linear-gradient(180deg, black 0%, transparent 55%)',
              WebkitMaskImage: 'linear-gradient(180deg, black 0%, transparent 55%)',
            }}
          />
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0,0,0,0.55) 100%)' }} />
    </AbsoluteFill>
  );
};

import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { CapPhrase, sceneCaptions } from '../lib/captions';
import { COLORS, FONT } from '../theme';

export type CaptionsProps = {
  /** scene id to read from captions.json ("04") … */
  sceneId?: string;
  /** … or explicit phrases (seconds relative to this component's frame 0) */
  phrases?: CapPhrase[];
  /** seconds to add to the current time before lookup (e.g. captions start later than the Sequence) */
  offsetSec?: number;
  position?: 'bottom' | 'center' | 'top';
  /** emphasis colour (default accent teal; hook uses fault red) */
  accent?: string;
  /** base font size px (default 58) */
  size?: number;
  maxWidth?: number;
  /** darken behind bottom captions for legibility over footage (default true for bottom) */
  scrim?: boolean;
  /** highlight sweep behind emphasis words (default true) */
  sweep?: boolean;
  /** stop showing captions after this many seconds (e.g. when an end card shows the same words) */
  until?: number;
};

/**
 * Kinetic captions: one short phrase at a time; each word pops in on its own timestamp; emphasis words are bigger,
 * accent-coloured, with a highlight sweep. Bottom position sits inside the CAPTION_SAFE band.
 */
export const Captions: React.FC<CaptionsProps> = ({ sceneId, phrases: given, offsetSec = 0, position = 'bottom', accent = COLORS.accent, size = 58, maxWidth = 1560, scrim, sweep = true, until: stopAt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const phrases = given ?? (sceneId ? sceneCaptions(sceneId)?.phrases : undefined) ?? [];
  const t = frame / fps + offsetSec;
  const useScrim = scrim ?? position === 'bottom';

  // The active phrase: from just before its first word until the next phrase starts (or 0.7 s after its end).
  let idx = -1;
  for (let i = 0; i < phrases.length; i++) {
    const next = phrases[i + 1];
    const until = next ? Math.min(next.start - 0.06, phrases[i].end + 1.2) : phrases[i].end + 0.7;
    if (t >= phrases[i].start - 0.1 && t < until) idx = i;
  }
  const scrimEl = useScrim && position === 'bottom' && (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, transparent 72%, rgba(6,9,13,0.55) 86%, rgba(6,9,13,0.8) 100%)', pointerEvents: 'none' }} />
  );
  if (idx < 0 || (stopAt !== undefined && t >= stopAt)) return <>{scrimEl}</>;
  const ph = phrases[idx];
  const next = phrases[idx + 1];
  const until = next ? Math.min(next.start - 0.06, ph.end + 1.2) : ph.end + 0.7;
  const exitF = (until - t) * fps; // frames until exit
  const exit = interpolate(exitF, [0, 5], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const place: React.CSSProperties =
    position === 'bottom'
      ? { justifyContent: 'flex-end', paddingBottom: 74 }
      : position === 'top'
        ? { justifyContent: 'flex-start', paddingTop: 90 }
        : { justifyContent: 'center' };

  return (
    <>
      {scrimEl}
      <AbsoluteFill style={{ alignItems: 'center', ...place, pointerEvents: 'none' }}>
        <div
          style={{
            maxWidth,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'baseline',
            columnGap: size * 0.28,
            rowGap: size * 0.08,
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: size,
            lineHeight: 1.12,
            letterSpacing: '-0.02em',
            color: COLORS.text,
            opacity: 1 - exit,
            transform: `translateY(${-18 * exit}px)`,
            textShadow: '0 4px 18px rgba(0,0,0,0.65), 0 2px 4px rgba(0,0,0,0.5)',
          }}
        >
          {ph.words.map((w, i) => {
            const wf = (t - w.start + 0.05) * fps;
            if (wf < 0) return <span key={i} style={{ opacity: 0, fontSize: w.emphasis ? size * 1.16 : size }}>{w.text}</span>;
            const s = spring({ frame: wf, fps, config: { damping: 11, stiffness: 210, mass: 0.6 } });
            // settle within ~5 frames so a word that has appeared already sits on the shared baseline at full size
            void s;
            const sc = interpolate(wf, [0, 5], [0.9, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
            const y = interpolate(wf, [0, 5], [8, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
            const op = interpolate(wf, [0, 3], [0, 1], { extrapolateRight: 'clamp' });
            const sweepP = interpolate(wf, [2, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            return (
              <span
                key={i}
                style={{
                  position: 'relative',
                  display: 'inline-block',
                  fontSize: w.emphasis ? size * 1.16 : size,
                  color: w.emphasis ? accent : COLORS.text,
                  opacity: op,
                  transform: `translateY(${y}px) scale(${sc})`,
                  transformOrigin: '50% 80%',
                  whiteSpace: 'nowrap',
                }}
              >
                {w.emphasis && sweep && (
                  <span
                    style={{
                      position: 'absolute',
                      left: ph.words[i - 1]?.emphasis ? 0 : -size * 0.1,
                      right: ph.words[i + 1]?.emphasis ? -size * 0.29 : -size * 0.1,
                      top: '18%',
                      bottom: '6%',
                      borderRadius: `${ph.words[i - 1]?.emphasis ? 0 : size * 0.12}px ${ph.words[i + 1]?.emphasis ? 0 : size * 0.12}px ${ph.words[i + 1]?.emphasis ? 0 : size * 0.12}px ${ph.words[i - 1]?.emphasis ? 0 : size * 0.12}px`,
                      background: `color-mix(in srgb, ${accent} 22%, transparent)`,
                      transform: `scaleX(${sweepP})`,
                      transformOrigin: '0 50%',
                      zIndex: -1,
                    }}
                  />
                )}
                {w.text}
              </span>
            );
          })}
        </div>
      </AbsoluteFill>
    </>
  );
};

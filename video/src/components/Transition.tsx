import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Freeze, OffthreadVideo } from 'remotion';
import { DeviceKind, useCapture } from '../lib/capture';
import { PlaceholderScreen } from './PlaceholderScreen';
import { DeviceFrame } from './DeviceFrame';

export type TransitionKind = 'none' | 'fade' | 'swipe-left' | 'swipe-right' | 'swipe-up' | 'zoom-through' | 'pop';

export type TransitionProps = {
  enter?: TransitionKind;
  exit?: TransitionKind;
  /** total frames of the wrapped content (needed for exit) */
  durationInFrames: number;
  enterFrames?: number;
  exitFrames?: number;
  children: React.ReactNode;
};

function styleFor(kind: TransitionKind, p: number, dir: 'in' | 'out'): React.CSSProperties {
  // p: 0 = fully off, 1 = fully on
  const q = 1 - p;
  switch (kind) {
    case 'fade':
      return { opacity: p };
    case 'swipe-left': {
      const x = (dir === 'in' ? 1 : -1) * q * 1920;
      return { transform: `translateX(${x}px) skewX(${(dir === 'in' ? -1 : 1) * q * 6}deg)`, filter: q > 0.02 ? `blur(${q * 10}px)` : undefined };
    }
    case 'swipe-right': {
      const x = (dir === 'in' ? -1 : 1) * q * 1920;
      return { transform: `translateX(${x}px) skewX(${(dir === 'in' ? 1 : -1) * q * 6}deg)`, filter: q > 0.02 ? `blur(${q * 10}px)` : undefined };
    }
    case 'swipe-up': {
      const y = (dir === 'in' ? 1 : -1) * q * 1080;
      return { transform: `translateY(${y}px)`, filter: q > 0.02 ? `blur(${q * 8}px)` : undefined };
    }
    case 'zoom-through': {
      const s = dir === 'in' ? 0.72 + 0.28 * p : 1 + q * 1.6;
      return { transform: `scale(${s})`, opacity: dir === 'in' ? Math.min(1, p * 1.6) : p, filter: q > 0.02 ? `blur(${q * 14}px)` : undefined };
    }
    case 'pop':
      return { transform: `scale(${0.85 + 0.15 * p})`, opacity: p };
    default:
      return {};
  }
}

/**
 * Enter / exit animation for a block of content. Scenes don't overlap (keeps narration clean); the shared Background
 * underneath makes a swipe-out + swipe-in read as one move.
 */
export const Transition: React.FC<TransitionProps> = ({ enter = 'none', exit = 'none', durationInFrames, enterFrames = 14, exitFrames = 10, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  let style: React.CSSProperties = {};
  if (enter !== 'none' && frame < enterFrames + 6) {
    const p = spring({ frame, fps, config: { damping: 18, stiffness: 140 }, durationInFrames: enterFrames });
    style = styleFor(enter, p, 'in');
  }
  const fromEnd = durationInFrames - frame;
  if (exit !== 'none' && fromEnd <= exitFrames) {
    const p = interpolate(fromEnd, [0, exitFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    style = styleFor(exit, p * p * (3 - 2 * p), 'out');
  }
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};

export type DeviceSwapProps = {
  from: DeviceKind;
  /** frames for the whole swap (default 20). The incoming device appears at the halfway point. */
  frames?: number;
  /** optional content for the outgoing device's screen (viewport px) */
  fromScreen?: React.ReactNode;
  /** or: show the last frame of this capture (e.g. the previous scene's shot) on the outgoing device */
  fromCapture?: string;
  /** clip second of fromCapture to show (default: its last frame) */
  fromAt?: number;
  fromLayout?: { screenWidth?: number; cx?: number; cy?: number };
  children: React.ReactNode;
};

/**
 * Device swap (laptop ↔ phone ↔ tablet): the previous device flips away on Y while shrinking, the new shot (children)
 * flips in from the other side. Place at the start of the incoming scene.
 */
export const DeviceSwap: React.FC<DeviceSwapProps> = ({ from, frames = 14, fromScreen, fromCapture, fromAt, fromLayout, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cap = useCapture(fromScreen ? undefined : fromCapture);
  const half = frames / 2;
  if (frame >= frames) return <AbsoluteFill>{children}</AbsoluteFill>;
  const pOut = interpolate(frame, [0, half], [0, 1], { extrapolateRight: 'clamp' });
  const pIn = interpolate(frame, [half, frames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const eo = pOut * pOut;
  const ei = 1 - (1 - pIn) ** 3;
  return (
    <AbsoluteFill>
      {frame < half && (
        <AbsoluteFill style={{ transform: `perspective(1800px) rotateY(${eo * 90}deg) scale(${1 - eo * 0.25})`, opacity: 1 - eo * 0.4 }}>
          <DeviceFrame device={from} viewport={cap.status === 'ready' ? cap.timeline.viewport : undefined} {...fromLayout}>
            {fromScreen ??
              (cap.status === 'ready' ? (
                <Freeze frame={0}>
                  <OffthreadVideo src={cap.video} muted trimBefore={Math.max(0, fromAt !== undefined ? Math.round(fromAt * fps) : Math.round(cap.timeline.durationSec * fps) - 3)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
                </Freeze>
              ) : fromCapture ? (
                <PlaceholderScreen id={fromCapture} device={from} viewport={{ w: from === 'phone' ? 390 : from === 'tablet' ? 1280 : 1920, h: from === 'phone' ? 844 : from === 'tablet' ? 800 : 1200 }} />
              ) : (
                <div style={{ position: 'absolute', inset: 0, background: '#0b0f14' }} />
              ))}
          </DeviceFrame>
        </AbsoluteFill>
      )}
      {frame >= half && (
        <AbsoluteFill style={{ transform: `perspective(1800px) rotateY(${(1 - ei) * -90}deg) scale(${0.75 + 0.25 * ei})`, opacity: 0.6 + 0.4 * ei }}>{children}</AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

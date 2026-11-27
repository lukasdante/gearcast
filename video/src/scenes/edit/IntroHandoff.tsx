/**
 * Scene 01 + its hand-off into 02: in the last ~1.4 s the whole intro (logo + role cards) turns out to be the screen
 * of a laptop — the camera pulls back, the cards shrink into the screen and dissolve into the GearCast login page,
 * which is exactly where scene 02's laptop shot starts (same default laptop layout, no transition).
 */
import React from 'react';
import { AbsoluteFill, Easing, Freeze, interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { DeviceFrame, layoutDevice } from '../../components/DeviceFrame';
import { IntroScene } from '../motion';
import { SceneRenderProps } from '../../components/Scene';

export function makeIntroHandoff(o: { capture: string; clipSec: number; handoffSec?: number }): React.FC<SceneRenderProps> {
  const Comp: React.FC<SceneRenderProps> = ({ durationInFrames }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const hf = Math.round((o.handoffSec ?? 1.4) * fps);
    const start = durationInFrames - hf - 2;
    if (frame < start) return <IntroScene />;

    const L = layoutDevice({ device: 'laptop' });
    const cx = L.screen.x + L.screen.w / 2;
    const cy = L.screen.y + L.screen.h / 2;
    const S0 = 1920 / L.screen.w;
    const p = interpolate(frame, [start, start + hf], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.55, 0, 0.25, 1) });
    const s = Math.exp(Math.log(S0) * (1 - p));
    const X = 960 + (cx - 960) * p;
    const Y = 540 + (cy - 540) * p;
    const introOp = interpolate(p, [0.3, 0.85], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const vw = L.viewport.w;
    const vh = L.viewport.h;
    return (
      <AbsoluteFill>
        <AbsoluteFill style={{ transformOrigin: '0 0', transform: `translate(${X - cx * s}px, ${Y - cy * s}px) scale(${s})` }}>
          <DeviceFrame device="laptop">
            <Freeze frame={0}>
              <OffthreadVideo src={staticFile(`captures/${o.capture}.webm`)} muted trimBefore={Math.round(o.clipSec * fps)} style={{ position: 'absolute', left: 0, top: 0, width: vw, height: vh }} />
            </Freeze>
            {introOp > 0.001 && (
              <div style={{ position: 'absolute', left: 0, top: 0, width: vw, height: vh, background: '#0b0f14', opacity: introOp, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: 0, top: (vh - 1080) / 2, width: 1920, height: 1080, transform: `scale(${vw / 1920})`, transformOrigin: '0 0' }}>
                  <IntroScene />
                </div>
              </div>
            )}
          </DeviceFrame>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  };
  return Comp;
}

import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig } from 'remotion';
import { getAudioDurationInSeconds } from '@remotion/media-utils';
import { sceneCaptions } from '../lib/captions';
import { DeviceKind } from '../lib/capture';
import { COLORS } from '../theme';
import { Background, BackgroundProps } from './Background';
import { Captions, CaptionsProps } from './Captions';
import { CaptureShot, CaptureShotProps } from './CaptureShot';
import { ApprovalToast, ApprovalToastProps, OverlayLayer, RoleBadge, RoleBadgeProps, SceneTitle } from './Overlays';
import { DeviceSwap, Transition, TransitionKind } from './Transition';

/** A device shot placed inside a scene. `at` / `until` are seconds from the scene start (= narration clip start). */
export type ShotSpec = CaptureShotProps & {
  at: number;
  /** default: next shot's `at`, or scene end */
  until?: number;
  enter?: TransitionKind;
  exit?: TransitionKind;
  /** flip in from this device (DeviceSwap) instead of `enter` */
  swapFrom?: DeviceKind;
  /** capture whose last frame is shown on the outgoing device (default: previous shot in this scene, if any) */
  swapFromCapture?: string;
  /** clip second of swapFromCapture shown on the outgoing device (default: its last frame) */
  swapFromAt?: number;
  /** device placement of the outgoing device (match the previous shot's `layout`) */
  swapFromLayout?: { screenWidth?: number; cx?: number; cy?: number };
};

export type SceneRenderProps = { id: string; durationInFrames: number };

export type SceneSpec = {
  /** "00" … "13" — audio is audio/<id>.wav, captions from captions.json scene <id> */
  id: string;
  /** internal name shown in Studio */
  name: string;
  /** override audio path (relative to public/) */
  audio?: string;
  /** used only when the audio file (and captions durationSec) are missing */
  estSec: number;
  /** silence after the clip (default captions tailSec ?? 0.5) */
  tailSec?: number;
  /** extra hold after the tail (end card) */
  holdSec?: number;
  background?: BackgroundProps['variant'] | false;
  /** scene-level enter/exit (applies to shots/component, not to captions) */
  enter?: TransitionKind;
  exit?: TransitionKind;
  captions?: Omit<CaptionsProps, 'sceneId' | 'phrases'> | false;
  /** feature chip label(s); seconds from scene start */
  chips?: { at: number; label: string }[];
  chipsUntil?: number;
  badges?: RoleBadgeProps[];
  toasts?: ApprovalToastProps[];
  shots?: ShotSpec[];
  /** full custom visuals (motion graphics). Rendered under the overlays/captions. */
  component?: React.FC<SceneRenderProps> | React.FC;
  /** volume of the narration (default 1), or a function of seconds from the clip start */
  volume?: number | ((sec: number) => number);
  /** extra overlay layers (scene-relative timing), drawn above shots, below captions */
  overlays?: React.ReactNode;
};

/** Seconds of the narration clip: real audio length → captions.json durationSec → estSec. */
export async function sceneAudioSeconds(s: SceneSpec): Promise<number> {
  const audio = s.audio ?? `audio/${s.id}.wav`;
  try {
    return await getAudioDurationInSeconds(staticFile(audio));
  } catch {
    return sceneCaptions(s.id)?.durationSec ?? s.estSec;
  }
}

export function sceneSecondsTotal(s: SceneSpec, audioSec: number) {
  const tail = s.tailSec ?? sceneCaptions(s.id)?.tailSec ?? 0.5;
  return audioSec + tail + (s.holdSec ?? 0);
}

/**
 * One scene: narration clip + background + shots (or a custom component) + chips/badges/toasts + kinetic captions.
 * Must be placed in a Sequence of `durationInFrames` (GearcastPromo does this from the scene list).
 */
export const Scene: React.FC<{ spec: SceneSpec; durationInFrames: number; startFrame?: number; hasAudio?: boolean }> = ({ spec, durationInFrames, startFrame = 0, hasAudio = true }) => {
  const { fps } = useVideoConfig();
  const shots = spec.shots ?? [];
  const sceneSec = durationInFrames / fps;
  const Comp = spec.component as React.FC<SceneRenderProps> | undefined;

  const visuals = (
    <>
      {Comp && <Comp id={spec.id} durationInFrames={durationInFrames} />}
      {shots.map((sh, i) => {
        const from = Math.round(sh.at * fps);
        const untilSec = sh.until ?? shots[i + 1]?.at ?? sceneSec;
        const dur = Math.max(1, Math.round(untilSec * fps) - from);
        const { at: _a, until: _u, enter, exit, swapFrom, swapFromCapture, swapFromAt, swapFromLayout, ...shotProps } = sh;
        const fromCap = swapFromCapture ?? shots[i - 1]?.capture;
        const shot = <CaptureShot {...shotProps} />;
        return (
          <Sequence key={i} from={from} durationInFrames={dur} name={`shot ${sh.capture ?? i}`}>
            <Transition enter={swapFrom ? 'none' : enter ?? 'none'} exit={exit ?? 'none'} durationInFrames={dur}>
              {swapFrom ? <DeviceSwap from={swapFrom} fromCapture={fromCap} fromAt={swapFromAt} fromLayout={swapFromLayout}>{shot}</DeviceSwap> : shot}
            </Transition>
          </Sequence>
        );
      })}
    </>
  );

  return (
    <AbsoluteFill style={{ background: spec.background === false ? undefined : COLORS.bg }}>
      {spec.background !== false && <Background variant={spec.background ?? 'brand'} frameOffset={startFrame} />}
      <Transition enter={spec.enter} exit={spec.exit} durationInFrames={durationInFrames}>
        {visuals}
      </Transition>
      <OverlayLayer>
        {spec.chips && spec.chips.length > 0 && <SceneTitle labels={spec.chips} until={spec.chipsUntil ?? sceneSec - 0.45} />}
        {(spec.badges ?? []).map((b, i) => (
          <RoleBadge key={i} until={b.until ?? sceneSec - 0.4} {...b} />
        ))}
        {(spec.toasts ?? []).map((t, i) => (
          <ApprovalToast key={i} {...t} />
        ))}
        {spec.overlays}
      </OverlayLayer>
      {spec.captions !== false && <Captions sceneId={spec.id} {...(spec.captions || {})} />}
      {hasAudio && (
        <Audio
          src={staticFile(spec.audio ?? `audio/${spec.id}.wav`)}
          volume={typeof spec.volume === 'function' ? (f: number) => (spec.volume as (s: number) => number)(f / fps) : spec.volume ?? 1}
        />
      )}
    </AbsoluteFill>
  );
};

import React from 'react';
import { AbsoluteFill, Audio, CalculateMetadataFunction, Sequence, staticFile } from 'remotion';
import { Scene, sceneAudioSeconds, sceneSecondsTotal, SceneSpec } from '../components/Scene';
import { ensureFonts } from '../fonts';
import { SCENES } from '../timeline';
import { COLORS, VIDEO } from '../theme';

export type PromoProps = {
  /** frames per scene, computed in calculateMetadata (audio length + tail + hold) */
  sceneFrames: number[];
  /** optional background music (public/ path), ducked under narration */
  music?: string | null;
  musicVolume?: number;
  /** restrict to a subset of scene ids (for previews) */
  only?: string[] | null;
};

const pick = (only?: string[] | null): SceneSpec[] => (only && only.length ? SCENES.filter((s) => only.includes(s.id)) : SCENES);

export const calculatePromoMetadata: CalculateMetadataFunction<PromoProps> = async ({ props }) => {
  const scenes = pick(props.only);
  const secs = await Promise.all(scenes.map(sceneAudioSeconds));
  const sceneFrames = scenes.map((s, i) => Math.ceil(sceneSecondsTotal(s, secs[i]) * VIDEO.fps));
  return { durationInFrames: Math.max(1, sceneFrames.reduce((a, b) => a + b, 0)), props: { ...props, sceneFrames } };
};

export const GearcastPromo: React.FC<PromoProps> = ({ sceneFrames, music, musicVolume = 0.12, only }) => {
  ensureFonts();
  const scenes = pick(only);
  let at = 0;
  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      {scenes.map((s, i) => {
        const dur = sceneFrames[i] ?? Math.ceil(s.estSec * VIDEO.fps);
        const from = at;
        at += dur;
        return (
          <Sequence key={s.id} from={from} durationInFrames={dur} name={`${s.id} ${s.name}`}>
            <Scene spec={s} durationInFrames={dur} startFrame={from} />
          </Sequence>
        );
      })}
      {music && <Audio src={staticFile(music)} volume={musicVolume} loop />}
    </AbsoluteFill>
  );
};

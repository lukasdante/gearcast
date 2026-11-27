import React from 'react';
import { Composition, Folder } from 'remotion';
import { ComponentShowcase, SHOWCASE_FRAMES } from './compositions/ComponentShowcase';
import { calculatePromoMetadata, GearcastPromo, PromoProps } from './compositions/GearcastPromo';
import { MotionCompositions } from './scenes/motion';
import { SCENES } from './timeline';
import { VIDEO } from './theme';
import { CAPTIONS } from './lib/captions';

const base = { fps: VIDEO.fps, width: VIDEO.width, height: VIDEO.height } as const;

export const RemotionRoot: React.FC = () => {
  if (CAPTIONS.source !== 'captions.json') console.warn(`[gearcast] captions source: ${CAPTIONS.source}`);
  return (
    <>
      <Composition
        id="GearcastPromo"
        component={GearcastPromo}
        durationInFrames={160 * VIDEO.fps}
        {...base}
        defaultProps={{ sceneFrames: [], music: null, musicVolume: 0.12, only: null } satisfies PromoProps}
        calculateMetadata={calculatePromoMetadata}
      />
      <Composition id="ComponentShowcase" component={ComponentShowcase} durationInFrames={SHOWCASE_FRAMES} {...base} />
      <Folder name="Scenes">
        {SCENES.map((s) => (
          <Composition
            key={s.id}
            id={`Scene-${s.id}`}
            component={GearcastPromo}
            durationInFrames={Math.ceil(s.estSec * VIDEO.fps)}
            {...base}
            defaultProps={{ sceneFrames: [], music: null, musicVolume: 0.12, only: [s.id] } satisfies PromoProps}
            calculateMetadata={calculatePromoMetadata}
          />
        ))}
      </Folder>
      <Folder name="Motion">
        <MotionCompositions />
      </Folder>
    </>
  );
};

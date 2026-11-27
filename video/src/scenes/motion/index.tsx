/**
 * Motion scenes (00 hook, 01 intro, 13 close) and the React-built illustrations, ready to register.
 *
 *   import { MotionCompositions } from './scenes/motion';
 *   … inside RemotionRoot: <MotionCompositions />
 *
 * Or use MOTION_SCENES / MOTION_ILLUSTRATIONS to place the components yourself (e.g. inside <Series>).
 * Scene durations follow the narration clip (captions.json durationSec) plus a tail; the close holds the end
 * card ~1.6 s past the audio. Illustration PNGs: `node src/scenes/motion/render-illustrations.mjs`.
 */
import React from 'react';
import { Composition } from 'remotion';
import { ensureFonts } from '../../fonts';
import { CloseScene } from './CloseScene';
import { HookScene } from './HookScene';
import { IntroScene } from './IntroScene';
import { sceneSeconds } from './timing';
import { JobSheet } from './illustrations/JobSheet';
import { PmFindings1, PmFindings2 } from './illustrations/PmFindings';
import { QrLabel } from './illustrations/QrLabel';
import { WornBearing } from './illustrations/WornBearing';

export { HookScene, IntroScene, CloseScene, WornBearing, PmFindings1, PmFindings2, JobSheet, QrLabel };
export { GearCastLogo } from './parts';
export { Avatar, AVATARS } from './Avatars';

const FPS = 30;
const frames = (s: number) => Math.ceil(s * FPS);

export type MotionEntry = { id: string; component: React.FC; durationInFrames: number; width: number; height: number; scene?: string; png?: string };

export const MOTION_SCENES: MotionEntry[] = [
  { id: 'Motion-00-Hook', scene: '00', component: HookScene, durationInFrames: frames(sceneSeconds('00', 18.16) + 0.3), width: 1920, height: 1080 },
  { id: 'Motion-01-Intro', scene: '01', component: IntroScene, durationInFrames: frames(sceneSeconds('01', 10.16) + 0.4), width: 1920, height: 1080 },
  { id: 'Motion-13-Close', scene: '13', component: CloseScene, durationInFrames: frames(sceneSeconds('13', 7.44) + 1.6), width: 1920, height: 1080 },
];

export const MOTION_ILLUSTRATIONS: MotionEntry[] = [
  { id: 'Illus-worn-bearing', png: 'worn-bearing.png', component: WornBearing, durationInFrames: 1, width: 1600, height: 1200 },
  { id: 'Illus-pm-findings-1', png: 'pm-findings-1.png', component: PmFindings1, durationInFrames: 1, width: 1600, height: 1200 },
  { id: 'Illus-pm-findings-2', png: 'pm-findings-2.png', component: PmFindings2, durationInFrames: 1, width: 1600, height: 1200 },
  { id: 'Illus-job-sheet', png: 'job-sheet.png', component: JobSheet, durationInFrames: 1, width: 1700, height: 2200 },
  { id: 'Illus-qr-label', png: 'qr-label.png', component: QrLabel, durationInFrames: 1, width: 1400, height: 1000 },
];

const withFonts = (C: React.FC): React.FC => () => { ensureFonts(); return <C />; };
const wrapped = new Map<React.FC, React.FC>();
const wrap = (C: React.FC) => { if (!wrapped.has(C)) wrapped.set(C, withFonts(C)); return wrapped.get(C)!; };

/** All motion + illustration compositions (drop into the engine's Root). */
export const MotionCompositions: React.FC = () => (
  <>
    {[...MOTION_SCENES, ...MOTION_ILLUSTRATIONS].map(e => (
      <Composition key={e.id} id={e.id} component={wrap(e.component)} durationInFrames={e.durationInFrames} fps={FPS} width={e.width} height={e.height} />
    ))}
  </>
);

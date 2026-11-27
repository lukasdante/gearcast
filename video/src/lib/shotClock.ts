import { createContext, useContext } from 'react';
import { CaptureTimeline } from './capture';

/**
 * Time base shared by everything inside a capture shot. `clipTime` is the .webm time currently on screen; `frameOf`
 * maps a clip time to the shot-local frame where it is shown (NaN if cut out by segments). Outside a CaptureShot,
 * components fall back to frame/fps.
 */
export type ShotClock = {
  frame: number;
  fps: number;
  clipTime: number;
  frameOf: (clipSec: number) => number;
  /** clip time → frame, times inside a cut snap to the next segment start */
  frameAfter: (clipSec: number) => number;
  timeline?: CaptureTimeline;
};

export const ShotClockContext = createContext<ShotClock | null>(null);
export const useShotClock = () => useContext(ShotClockContext);

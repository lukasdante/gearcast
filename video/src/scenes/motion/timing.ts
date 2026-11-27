/** Word-level beat lookup for the motion scenes, on top of the engine's caption loader (src/lib/captions.ts).
 *  Only real narration timings (captions.json) are trusted; with the evenly-spread stub (or a word not found) each
 *  lookup returns its fallback, which is the approximate time measured from the recorded clip. */
import { CAPTIONS, cueTime, sceneCaptions } from '../../lib/captions';

const real = () => CAPTIONS.source === 'captions.json';

/** Seconds at which `phrase` starts (or ends) in scene `scene` ("00", "01", "13"). */
export function wordTime(scene: string, phrase: string, fallback: number, which: 'start' | 'end' = 'start'): number {
  return real() ? cueTime(scene, phrase, fallback, which) : fallback;
}

/** Narration clip length for a scene (seconds). */
export function sceneSeconds(scene: string, fallback: number): number {
  const d = real() ? sceneCaptions(scene)?.durationSec : undefined;
  return typeof d === 'number' && d > 0 ? d : fallback;
}

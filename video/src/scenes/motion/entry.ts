/** Standalone entry for previewing / rendering only the motion compositions:
 *  npx remotion still src/scenes/motion/entry.ts Illus-qr-label out.png */
import { registerRoot } from 'remotion';
import { MotionRoot } from './MotionRoot';

registerRoot(MotionRoot);

import { useGLTF } from '@react-three/drei';
import type { AssetModelProps } from '../types';
import { GlbAsset, modelUrl } from '../shared/GlbAsset';
import { META } from './meta';

const URL = modelUrl('vibrator_motor');

/** vibrator_motor: Blender-built GLB (models-src/vibrator_motor.py). */
export function VibratorMotor(props: AssetModelProps) {
  return <GlbAsset url={URL} footprint={META.vibrator_motor.footprint} {...props} />;
}

if (META.vibrator_motor) useGLTF.preload(URL);

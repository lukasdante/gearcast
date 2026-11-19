import { useGLTF } from '@react-three/drei';
import type { AssetModelProps } from '../types';
import { GlbAsset, modelUrl, type WaterStyle } from '../shared/GlbAsset';
import { META } from './meta';

const URL = modelUrl('tank');
const WATER: WaterStyle = { color: '#2c3f3a', ripple: 0.3 };

/** tank: Blender-built GLB (models-src/tank.py). */
export function Tank(props: AssetModelProps) {
  return <GlbAsset url={URL} footprint={META.tank.footprint} scalable water={WATER} waterRange={META.tank.water} {...props} />;
}

if (META.tank) useGLTF.preload(URL);

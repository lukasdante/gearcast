import { useGLTF } from '@react-three/drei';
import type { AssetModelProps } from '../types';
import { GlbAsset, modelUrl, type WaterStyle } from '../shared/GlbAsset';
import { META } from './meta';

const URL = modelUrl('clarifier');
const WATER: WaterStyle = { color: '#2a4146', ripple: 0.25 };

/** clarifier: Blender-built GLB (models-src/clarifier.py). */
export function Clarifier(props: AssetModelProps) {
  return <GlbAsset url={URL} footprint={META.clarifier.footprint} scalable water={WATER} waterRange={META.clarifier.water} {...props} />;
}

useGLTF.preload(URL);

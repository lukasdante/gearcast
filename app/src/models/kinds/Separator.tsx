import { useGLTF } from '@react-three/drei';
import type { AssetModelProps } from '../types';
import { GlbAsset, modelUrl, type WaterStyle } from '../shared/GlbAsset';
import { META } from './meta';

const URL = modelUrl('separator');
const WATER: WaterStyle = { color: '#3a3a2a', ripple: 0.4 };

/** separator: Blender-built GLB (models-src/separator.py). */
export function Separator(props: AssetModelProps) {
  return <GlbAsset url={URL} footprint={META.separator.footprint} scalable water={WATER} waterRange={META.separator.water} {...props} />;
}

useGLTF.preload(URL);

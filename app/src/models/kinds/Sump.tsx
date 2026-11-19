import { useGLTF } from '@react-three/drei';
import type { AssetModelProps } from '../types';
import { GlbAsset, modelUrl, type WaterStyle } from '../shared/GlbAsset';
import { META } from './meta';

const URL = modelUrl('sump');
const WATER: WaterStyle = { color: '#33362c', ripple: 0.4 };

/** sump: Blender-built GLB (models-src/sump.py). */
export function Sump(props: AssetModelProps) {
  return <GlbAsset url={URL} footprint={META.sump.footprint} scalable water={WATER} waterRange={META.sump.water} {...props} />;
}

if (META.sump) useGLTF.preload(URL);

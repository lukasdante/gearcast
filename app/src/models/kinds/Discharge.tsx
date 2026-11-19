import { useGLTF } from '@react-three/drei';
import type { AssetModelProps } from '../types';
import { GlbAsset, modelUrl, type WaterStyle } from '../shared/GlbAsset';
import { META } from './meta';

const URL = modelUrl('discharge');
const WATER: WaterStyle = { color: '#21414a', ripple: 0.6 };

/** discharge: Blender-built GLB (models-src/discharge.py). */
export function Discharge(props: AssetModelProps) {
  return <GlbAsset url={URL} footprint={META.discharge.footprint} water={WATER} waterRange={META.discharge.water} {...props} />;
}

useGLTF.preload(URL);

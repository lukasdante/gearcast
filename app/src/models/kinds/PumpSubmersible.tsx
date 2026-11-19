import { useGLTF } from '@react-three/drei';
import type { AssetModelProps } from '../types';
import { GlbAsset, modelUrl } from '../shared/GlbAsset';
import { META } from './meta';

const URL = modelUrl('pump_submersible');

/** pump_submersible: Blender-built GLB (models-src/pump_submersible.py). */
export function PumpSubmersible(props: AssetModelProps) {
  return <GlbAsset url={URL} footprint={META.pump_submersible.footprint} {...props} />;
}

if (META.pump_submersible) useGLTF.preload(URL);

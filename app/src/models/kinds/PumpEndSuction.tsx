import { useGLTF } from '@react-three/drei';
import type { AssetModelProps } from '../types';
import { GlbAsset, modelUrl } from '../shared/GlbAsset';
import { META } from './meta';

const URL = modelUrl('pump_end_suction');

/** pump_end_suction: Blender-built GLB (models-src/pump_end_suction.py). */
export function PumpEndSuction(props: AssetModelProps) {
  return <GlbAsset url={URL} footprint={META.pump_end_suction.footprint} {...props} />;
}

useGLTF.preload(URL);

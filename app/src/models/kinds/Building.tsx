import { useGLTF } from '@react-three/drei';
import type { AssetModelProps } from '../types';
import { GlbAsset, modelUrl } from '../shared/GlbAsset';
import { META } from './meta';

const URL = modelUrl('building');

/** building: Blender-built GLB (models-src/building.py). */
export function Building(props: AssetModelProps) {
  return <GlbAsset url={URL} footprint={META.building.footprint} scalable {...props} />;
}

if (META.building) useGLTF.preload(URL);

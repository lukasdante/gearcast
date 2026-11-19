import { useGLTF } from '@react-three/drei';
import type { AssetModelProps } from '../types';
import { GlbAsset, modelUrl } from '../shared/GlbAsset';
import { META } from './meta';

const URL = modelUrl('spare_rack');

/** spare_rack: Blender-built GLB (models-src/spare_rack.py). */
export function SpareRack(props: AssetModelProps) {
  return <GlbAsset url={URL} footprint={META.spare_rack.footprint} {...props} />;
}

useGLTF.preload(URL);

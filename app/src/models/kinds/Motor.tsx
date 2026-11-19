import { useGLTF } from '@react-three/drei';
import type { AssetModelProps } from '../types';
import { GlbAsset, modelUrl } from '../shared/GlbAsset';
import { META } from './meta';

const URL = modelUrl('motor');

/** motor: Blender-built GLB (models-src/motor.py). */
export function Motor(props: AssetModelProps) {
  return <GlbAsset url={URL} footprint={META.motor.footprint} {...props} />;
}

useGLTF.preload(URL);

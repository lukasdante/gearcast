import { useGLTF } from '@react-three/drei';
import type { AssetModelProps } from '../types';
import { GlbAsset, modelUrl } from '../shared/GlbAsset';
import { META } from './meta';

const URL = modelUrl('custom_box');

/** custom_box: Blender-built GLB (models-src/custom_box.py). */
export function CustomBox(props: AssetModelProps) {
  return <GlbAsset url={URL} footprint={META.custom_box.footprint} scalable {...props} />;
}

if (META.custom_box) useGLTF.preload(URL);

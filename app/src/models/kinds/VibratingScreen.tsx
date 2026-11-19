import { useGLTF } from '@react-three/drei';
import type { AssetModelProps } from '../types';
import { GlbAsset, modelUrl } from '../shared/GlbAsset';
import { META } from './meta';

const URL = modelUrl('vibrating_screen');

/** vibrating_screen: Blender-built GLB (models-src/vibrating_screen.py). */
export function VibratingScreen(props: AssetModelProps) {
  return <GlbAsset url={URL} footprint={META.vibrating_screen.footprint} {...props} />;
}

if (META.vibrating_screen) useGLTF.preload(URL);

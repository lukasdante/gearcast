import { useGLTF } from '@react-three/drei';
import type { AssetModelProps } from '../types';
import { GlbAsset, modelUrl, type WaterStyle } from '../shared/GlbAsset';
import { META } from './meta';

const URL = modelUrl('bio_reactor');
const WATER: WaterStyle = { color: '#4a3e2c', ripple: 0.3 };

/** bio_reactor: Blender-built GLB (models-src/bio_reactor.py). */
export function BioReactor(props: AssetModelProps) {
  return <GlbAsset url={URL} footprint={META.bio_reactor.footprint} scalable water={WATER} waterRange={META.bio_reactor.water} {...props} />;
}

useGLTF.preload(URL);

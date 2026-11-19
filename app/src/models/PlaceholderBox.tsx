import type { AssetModelProps } from './types';

/** Temporary stand-in so the app can be built before real models land. */
export function PlaceholderBox({ statusColor, state }: AssetModelProps) {
  return (
    <mesh position={[0, 0.4, 0]} castShadow>
      <boxGeometry args={[1, 0.8, 0.6]} />
      <meshStandardMaterial color="#5a6470" emissive={statusColor} emissiveIntensity={state === 'fault' ? 0.6 : 0.08} transparent={state === 'ghost'} opacity={state === 'ghost' ? 0.4 : 1} />
    </mesh>
  );
}

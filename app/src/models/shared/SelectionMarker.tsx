import { useMemo } from 'react';
import * as THREE from 'three';
import { SELECT_CYAN, HOVER_TINT } from './palette';

function roundedRect(w: number, h: number, r: number): THREE.Path {
  const p = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  p.lineTo(x + w, y + h - r);
  p.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  p.lineTo(x + r, y + h);
  p.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  p.lineTo(x, y + r);
  p.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return p;
}

/** Crisp rounded-rectangle ground outline around the footprint (selected) or a faint one (hovered). */
export function SelectionMarker({ footprint, selected, hovered, ghost }: {
  footprint: [number, number]; selected: boolean; hovered: boolean; ghost?: boolean;
}) {
  const [fx, fz] = footprint;
  const geo = useMemo(() => {
    const m = Math.max(0.08, Math.min(fx, fz) * 0.08);
    const w = fx + 2 * m, h = fz + 2 * m;
    const band = THREE.MathUtils.clamp(Math.max(w, h) * 0.012, 0.018, 0.09);
    const r = Math.min(w, h) * 0.12;
    const outer = roundedRect(w, h, r) as THREE.Shape;
    outer.holes.push(roundedRect(w - 2 * band, h - 2 * band, Math.max(r - band, 0.001)));
    const g = new THREE.ShapeGeometry(outer, 8);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [fx, fz]);
  if (!selected && !hovered && !ghost) return null;
  return (
    <mesh geometry={geo} position={[0, 0.012, 0]} renderOrder={5}>
      <meshBasicMaterial
        color={selected || ghost ? SELECT_CYAN : HOVER_TINT}
        transparent
        opacity={selected ? 0.95 : ghost ? 0.5 : 0.45}
        depthWrite={false}
        toneMapped={false}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  );
}

/**
 * Generic wrapper for the Blender-built GLB assets (public/models/<kind>.glb).
 *
 * Node naming contract (models-src/lib.py):
 *   BODY*         fault pulse / hover tint
 *   ROTOR*        spins about userData.axis at userData.speed rad/s when running
 *   SHAKE*        oscillates along userData.dir with userData.amp metres when running
 *   STATUS_LAMP   lens recoloured with statusColor (+ glow sprite)
 *   STATUS_BAND*  emissive accent recoloured with statusColor
 *   WATER*        liquid surface; animated material, height from `level`
 */
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { AssetModelProps, VisualState } from '../types';
import { AMBER, FAULT_RED, HOVER_TINT } from './palette';
import { glowTexture, waterNormalTexture } from './textures';
import { SelectionMarker } from './SelectionMarker';

type Role = 'body' | 'rotor' | 'shake' | 'lamp' | 'band' | 'water' | 'other';

const PREFIX: [string, Role][] = [
  ['STATUS_LAMP', 'lamp'], ['STATUS_BAND', 'band'], ['BODY', 'body'], ['ROTOR', 'rotor'],
  ['SHAKE', 'shake'], ['WATER', 'water'],
];

function roleOf(o: THREE.Object3D | null): Role {
  // the outermost tagged ancestor wins (multi-material nodes become a Group with child meshes)
  let role: Role = 'other';
  for (let n = o; n; n = n.parent) {
    const hit = PREFIX.find(([p]) => n!.name.startsWith(p));
    if (hit) role = hit[1];
  }
  return role;
}

interface MatRec {
  mat: THREE.MeshStandardMaterial;
  role: Role;
  color: THREE.Color;
  emissive: THREE.Color;
  emissiveIntensity: number;
  opacity: number;
  transparent: boolean;
}

interface Instance {
  root: THREE.Object3D;
  mats: MatRec[];
  meshes: THREE.Mesh[];
  rotors: { node: THREE.Object3D; axis: 'x' | 'y' | 'z'; speed: number }[];
  shakers: { node: THREE.Object3D; base: THREE.Vector3; dir: THREE.Vector3; amp: number; freq: number }[];
  lamps: { mesh: THREE.Mesh; glow: THREE.Sprite }[];
  waters: { node: THREE.Object3D; mat: THREE.MeshStandardMaterial; tex: THREE.Texture }[];
}

export interface WaterStyle {
  color: string;
  opacity?: number;
  /** normal-map tiles per metre */
  ripple?: number;
}

function instantiate(scene: THREE.Object3D, water: WaterStyle): Instance {
  const root = scene.clone(true);
  const inst: Instance = { root, mats: [], meshes: [], rotors: [], shakers: [], lamps: [], waters: [] };
  root.traverse((o) => {
    const ud = o.userData as Record<string, unknown>;
    if (o.name.startsWith('ROTOR')) {
      inst.rotors.push({ node: o, axis: (ud.axis as 'x' | 'y' | 'z') ?? 'y', speed: Number(ud.speed ?? 6) });
    } else if (o.name.startsWith('SHAKE')) {
      const d = (ud.dir as number[] | undefined) ?? [0, 1, 0];
      inst.shakers.push({ node: o, base: o.position.clone(), dir: new THREE.Vector3(...d).normalize(),
        amp: Number(ud.amp ?? 0.004), freq: Number(ud.freq ?? 9) });
    } else if (o.name.startsWith('WATER')) {
      const tex = waterNormalTexture().clone();
      tex.needsUpdate = true;
      const r = water.ripple ?? 0.35;
      tex.repeat.set(r, r);
      const mat = new THREE.MeshStandardMaterial({
        color: water.color, roughness: 0.12, metalness: 0.05, normalMap: tex,
        normalScale: new THREE.Vector2(0.6, 0.6), transparent: true, opacity: water.opacity ?? 0.92,
      });
      o.traverse((m) => { if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).material = mat; });
      inst.waters.push({ node: o, mat, tex });
    }
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    inst.meshes.push(mesh);
    const role = roleOf(mesh);
    if (role === 'water') {
      mesh.receiveShadow = true;
      return;
    }
    const src = mesh.material as THREE.MeshStandardMaterial;
    const mat = src.clone();
    mesh.material = mat;
    inst.mats.push({ mat, role, color: mat.color.clone(), emissive: mat.emissive.clone(),
      emissiveIntensity: mat.emissiveIntensity, opacity: mat.opacity, transparent: mat.transparent });
    if (role === 'lamp') {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending,
        depthWrite: false, transparent: true, toneMapped: false }));
      mesh.geometry.computeBoundingSphere();
      const bs = mesh.geometry.boundingSphere!;
      glow.position.copy(bs.center);
      glow.scale.setScalar(Math.max(bs.radius * 9, 0.12));
      glow.renderOrder = 10;
      mesh.add(glow);
      inst.lamps.push({ mesh, glow });
    }
  });
  return inst;
}

const tmp = new THREE.Color();
const LAMP_OFF = new THREE.Color('#1c2025');

function accentFor(state: VisualState, statusColor: string): THREE.Color {
  if (state === 'fault') return new THREE.Color(FAULT_RED);
  if (state === 'maintenance') return new THREE.Color(AMBER);
  if (state === 'stored') return LAMP_OFF.clone();
  return new THREE.Color(statusColor);
}

export interface GlbAssetProps extends AssetModelProps {
  url: string;
  footprint: [number, number];
  /** structures honour the `scale` prop; machinery ignores it */
  scalable?: boolean;
  /** WATER* surface y range for level 0..1 */
  waterRange?: { min: number; max: number };
  water?: WaterStyle;
}

export function GlbAsset({ url, footprint, scalable, waterRange, water, state, statusColor, selected, hovered,
  level, scale }: GlbAssetProps) {
  const { scene } = useGLTF(url);
  const waterStyle = water ?? { color: '#1d3a40' };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const inst = useMemo(() => instantiate(scene, waterStyle), [scene, waterStyle.color, waterStyle.opacity, waterStyle.ripple]);

  useEffect(() => () => {
    inst.mats.forEach((r) => r.mat.dispose());
    inst.waters.forEach((w) => { w.mat.dispose(); w.tex.dispose(); });
    inst.lamps.forEach((l) => l.glow.material.dispose());
  }, [inst]);

  // static (per-state) material setup: ghost / stored / shadows
  useEffect(() => {
    const ghost = state === 'ghost';
    const stored = state === 'stored';
    for (const r of inst.mats) {
      if (stored && r.role !== 'lamp' && r.role !== 'band') {
        const l = r.color.r * 0.3 + r.color.g * 0.59 + r.color.b * 0.11;
        r.mat.color.setRGB(l, l, l).lerp(r.color, 0.15).multiplyScalar(0.85);
      } else {
        r.mat.color.copy(r.color);
      }
      r.mat.transparent = ghost || r.transparent;
      r.mat.opacity = ghost ? 0.35 : r.opacity;
      r.mat.depthWrite = !ghost;
      r.mat.needsUpdate = true;
    }
    for (const w of inst.waters) {
      w.mat.opacity = ghost ? 0.25 : (water?.opacity ?? 0.92);
      w.mat.depthWrite = !ghost;
    }
    for (const m of inst.meshes) {
      m.castShadow = !ghost && roleOf(m) !== 'water';
      m.receiveShadow = !ghost;
    }
    for (const l of inst.lamps) l.glow.visible = !stored && !ghost;
  }, [inst, state, water?.opacity]);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const running = state === 'running';
    const accent = accentFor(state, statusColor);
    const pulse = 0.5 + 0.5 * Math.sin(t * 5.5);
    for (const r of inst.mats) {
      if (r.role === 'lamp') {
        r.mat.color.copy(accent);
        r.mat.emissive.copy(accent);
        r.mat.emissiveIntensity = state === 'stored' ? 0 : state === 'fault' ? 1.2 + 2.2 * pulse : 2.0;
        r.mat.toneMapped = false;
      } else if (r.role === 'band') {
        r.mat.color.copy(accent).multiplyScalar(0.6);
        r.mat.emissive.copy(accent);
        r.mat.emissiveIntensity = state === 'stored' ? 0 : state === 'fault' ? 0.5 + 1.2 * pulse : 1.1;
      } else if (r.role === 'body') {
        if (state === 'fault') {
          r.mat.emissive.set(FAULT_RED);
          r.mat.emissiveIntensity = 0.05 + 0.2 * pulse;
        } else if (hovered) {
          r.mat.emissive.set(HOVER_TINT);
          r.mat.emissiveIntensity = 0.16;
        } else {
          r.mat.emissive.copy(r.emissive);
          r.mat.emissiveIntensity = r.emissiveIntensity;
        }
      } else if (hovered && state !== 'ghost') {
        r.mat.emissive.copy(tmp.set(HOVER_TINT));
        r.mat.emissiveIntensity = 0.08;
      } else {
        r.mat.emissive.copy(r.emissive);
        r.mat.emissiveIntensity = r.emissiveIntensity;
      }
    }
    for (const l of inst.lamps) {
      const m = l.glow.material;
      m.color.copy(accent);
      m.opacity = state === 'fault' ? 0.35 + 0.65 * pulse : 0.75;
    }
    if (running) {
      for (const r of inst.rotors) r.node.rotation[r.axis] += r.speed * Math.min(dt, 0.1);
      for (const s of inst.shakers)
        s.node.position.copy(s.base).addScaledVector(s.dir, s.amp * Math.sin(t * Math.PI * 2 * s.freq));
    } else {
      for (const s of inst.shakers) s.node.position.copy(s.base);
    }
    if (waterRange) {
      const lv = THREE.MathUtils.clamp(level ?? 0.7, 0, 1);
      for (const w of inst.waters) {
        w.node.position.y = waterRange.min + (waterRange.max - waterRange.min) * lv;
        if (state !== 'stored' && state !== 'ghost') {
          w.tex.offset.x = (t * 0.011) % 1;
          w.tex.offset.y = (t * 0.007) % 1;
        }
      }
    }
  });

  const s = scalable ? scale ?? 1 : 1;
  return (
    <group scale={s}>
      <primitive object={inst.root} />
      <SelectionMarker footprint={footprint} selected={!!selected} hovered={!!hovered} ghost={state === 'ghost'} />
    </group>
  );
}

/** Asset URL relative to the Vite base so it works under sub-path deployments. */
export const modelUrl = (kind: string) => `${import.meta.env.BASE_URL}models/${kind}.glb`;

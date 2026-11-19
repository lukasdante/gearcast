/**
 * Cached geometry builders. Geometries are shared between all instances and never disposed
 * (state effects only touch per-instance materials). All builders are keyed by their args.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V3 = [number, number, number];

const cache = new Map<string, THREE.BufferGeometry>();
export function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = cache.get(key) as T | undefined;
  if (!g) {
    g = make();
    g.computeBoundingSphere();
    cache.set(key, g);
  }
  return g;
}

const k = (...a: (number | string | boolean)[]) => a.map(v => (typeof v === 'number' ? +v.toFixed(4) : v)).join('|');

/** Cylinder along +Y, centred. */
export const cyl = (rt: number, rb = rt, h = 1, seg = 24, open = false) =>
  cached(k('cyl', rt, rb, h, seg, open), () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));

export const box = (w: number, h: number, d: number) => cached(k('box', w, h, d), () => new THREE.BoxGeometry(w, h, d));

export const rbox = (w: number, h: number, d: number, r = 0.02, seg = 2) =>
  cached(k('rbox', w, h, d, r, seg), () => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)));

export const sphere = (r: number, seg = 16) => cached(k('sph', r, seg), () => new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)));

export const torus = (R: number, r: number, arc = Math.PI * 2, radial = 8, tubular = 32) =>
  cached(k('tor', R, r, arc, radial, tubular), () => new THREE.TorusGeometry(R, r, radial, tubular, arc));

export const plane = (w: number, h: number) => cached(k('pl', w, h), () => new THREE.PlaneGeometry(w, h));

export const circle = (r: number, seg = 48) => cached(k('circ', r, seg), () => new THREE.CircleGeometry(r, seg));

export const ring = (ri: number, ro: number, seg = 64) => cached(k('ring', ri, ro, seg), () => new THREE.RingGeometry(ri, ro, seg, 1));

/** Lathe from [radius, y] profile (around Y). */
export const lathe = (key: string, pts: [number, number][], seg = 32) =>
  cached(k('lathe', key, seg), () => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg));

/** Transform helper for building merged geometries. */
export function xf(g: THREE.BufferGeometry, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 = [1, 1, 1]) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...p),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),
    new THREE.Vector3(...s),
  );
  return g.clone().applyMatrix4(m);
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const anyNonIndexed = parts.some(p => !p.index);
  const norm = parts.map(p => {
    const g = anyNonIndexed && p.index ? p.toNonIndexed() : p;
    // keep only shared attributes
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    return g;
  });
  const out = mergeGeometries(norm, false);
  if (!out) throw new Error('merge failed');
  return out;
}

/** Ring of hex bolt heads on a circle in the XZ plane, centred on y=0, along Y. */
export const boltRing = (n: number, radius: number, size = 0.012, h = 0.05) =>
  cached(k('bolts', n, radius, size, h), () => {
    const nut = new THREE.CylinderGeometry(size, size, h, 6);
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / n;
      parts.push(xf(nut, [Math.cos(a) * radius, 0, Math.sin(a) * radius]));
    }
    return merge(parts);
  });

/** Helical coil spring along +Y from 0..1 (scale Y for length). */
export const coilSpring = (R: number, wire: number, turns: number) =>
  cached(k('spring', R, wire, turns), () => {
    class Helix extends THREE.Curve<THREE.Vector3> {
      getPoint(t: number, target = new THREE.Vector3()) {
        const a = t * turns * Math.PI * 2;
        return target.set(Math.cos(a) * R, t, Math.sin(a) * R);
      }
    }
    return new THREE.TubeGeometry(new Helix(), turns * 24, wire, 6, false);
  });

/** Placement for a unit Y-cylinder spanning a→b. */
const _Y = new THREE.Vector3(0, 1, 0);
export function span(a: V3, b: V3) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const d = vb.clone().sub(va);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(_Y, d.clone().normalize());
  const mid = va.add(vb).multiplyScalar(0.5);
  return { position: mid.toArray() as V3, quaternion: q, length: len };
}

/** Rotation that turns a Y-axis primitive to the given axis. */
export const AXIS_ROT: Record<'x' | 'y' | 'z', V3> = {
  x: [0, 0, -Math.PI / 2],
  y: [0, 0, 0],
  z: [Math.PI / 2, 0, 0],
};

/** Rotate point (x,y) around origin by angle a (rad) in the XY plane. */
export function rotXY(x: number, y: number, a: number): [number, number] {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}

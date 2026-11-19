import * as THREE from 'three';
import { getKind } from '../models/registry';
import type { Port } from '../models/types';
import type { LayoutItem } from '../domain/layout';

export const GRID = 0.5;
export const snap = (v: number) => Math.round(v / GRID) * GRID;

export function findPort(item: LayoutItem, portId: string, fallback: 'in' | 'out'): Port | null {
  const ports = getKind(item.kind).ports;
  return ports.find(p => p.id === portId)
    ?? ports.find(p => p.id.startsWith(fallback))
    ?? ports[fallback === 'out' ? ports.length - 1 : 0]
    ?? null;
}

/** Port position/direction in world space (item rotation, scale and elevation applied). */
export function portWorld(item: LayoutItem, port: Port | null) {
  const s = item.scale ?? 1;
  const elev = item.props?.elevation ?? 0;
  const rot = new THREE.Euler(0, item.rotationY, 0);
  const local = new THREE.Vector3(...(port?.position ?? [0, 0.5, 0])).multiplyScalar(s);
  const pos = local.applyEuler(rot).add(new THREE.Vector3(item.position[0], elev, item.position[1]));
  const dir = new THREE.Vector3(...(port?.direction ?? [1, 0, 0])).applyEuler(rot).normalize();
  return { pos, dir };
}

/** Simple orthogonal route: stub out of each port, then X / Z / X legs at the source height, drop to the target. */
export function routePipe(a: { pos: THREE.Vector3; dir: THREE.Vector3 }, b: { pos: THREE.Vector3; dir: THREE.Vector3 }, stub = 0.6) {
  const a1 = a.pos.clone().addScaledVector(a.dir, stub);
  const b1 = b.pos.clone().addScaledVector(b.dir, stub);
  const y = a1.y;
  const mx = (a1.x + b1.x) / 2;
  const raw = [
    a.pos, a1,
    new THREE.Vector3(mx, y, a1.z),
    new THREE.Vector3(mx, y, b1.z),
    new THREE.Vector3(b1.x, y, b1.z),
    b1, b.pos,
  ];
  // drop duplicates and collinear points
  const pts: THREE.Vector3[] = [];
  for (const p of raw) {
    const last = pts[pts.length - 1];
    if (last && last.distanceTo(p) < 1e-3) continue;
    if (pts.length >= 2) {
      const d1 = last.clone().sub(pts[pts.length - 2]).normalize();
      const d2 = p.clone().sub(last).normalize();
      if (d1.dot(d2) > 0.999) { pts[pts.length - 1] = p; continue; }
    }
    pts.push(p.clone());
  }
  return pts;
}

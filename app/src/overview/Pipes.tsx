import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { LayoutDoc, LayoutItem, LayoutPipe } from '../domain/layout';
import { findPort, portWorld, routePipe } from './geometry';
import { pipeFlow, type Live, type PipeFlow } from './live';
import { useUi } from '../store/uiStore';

const R = 0.11;
const UP = new THREE.Vector3(0, 1, 0);
const time = { value: 0 };

const vert = /* glsl */ `
varying float vV;
void main() { vV = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const frag = /* glsl */ `
uniform float uTime; uniform float uLen; uniform float uStart; uniform vec3 uColor;
varying float vV;
void main() {
  float s = uStart + vV * uLen;
  float d = fract((s - uTime * 1.4) / 1.1);
  float a = smoothstep(0.0, 0.06, d) * (1.0 - smoothstep(0.38, 0.46, d));
  gl_FragColor = vec4(uColor * 1.6, a * 0.95);
}`;

const baseMat = {
  flow: new THREE.MeshStandardMaterial({ color: '#56616f', metalness: 0.7, roughness: 0.38 }),
  idle: new THREE.MeshStandardMaterial({ color: '#4a5462', metalness: 0.7, roughness: 0.45 }),
  noflow: new THREE.MeshStandardMaterial({ color: '#5a4d33', metalness: 0.5, roughness: 0.5, emissive: '#f2b53b', emissiveIntensity: 0.22 }),
  down: new THREE.MeshStandardMaterial({ color: '#5a3030', metalness: 0.5, roughness: 0.5, emissive: '#f05252', emissiveIntensity: 0.35 }),
  selected: new THREE.MeshStandardMaterial({ color: '#2fd0c1', metalness: 0.3, roughness: 0.4, emissive: '#2fd0c1', emissiveIntensity: 0.5 }),
} satisfies Record<PipeFlow | 'selected', THREE.Material>;

const cyl = new THREE.CylinderGeometry(R, R, 1, 16, 1, true);
const cylOver = new THREE.CylinderGeometry(R * 1.12, R * 1.12, 1, 16, 1, true);
const elbow = new THREE.SphereGeometry(R * 1.08, 16, 12);
const flange = new THREE.CylinderGeometry(R * 1.7, R * 1.7, 0.06, 20);

interface Seg { mid: THREE.Vector3; quat: THREE.Quaternion; len: number; start: number }

function segmentsOf(pts: THREE.Vector3[]): Seg[] {
  let acc = 0;
  const out: Seg[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const d = b.clone().sub(a);
    const len = d.length();
    if (len < 1e-4) continue;
    out.push({ mid: a.clone().add(b).multiplyScalar(0.5), quat: new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), len, start: acc });
    acc += len;
  }
  return out;
}

function PipeMesh({ pipe, a, b, flow, selected, onPick }: {
  pipe: LayoutPipe; a: LayoutItem; b: LayoutItem; flow: PipeFlow; selected: boolean; onPick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const { pts, segs, ends } = useMemo(() => {
    const pa = portWorld(a, findPort(a, pipe.from.port, 'out'));
    const pb = portWorld(b, findPort(b, pipe.to.port, 'in'));
    const pts = routePipe(pa, pb);
    return { pts, segs: segmentsOf(pts), ends: [pa, pb] };
  }, [a, b, pipe.from.port, pipe.to.port]);
  const color = pipe.flow === 'sludge' ? '#d79a52' : '#5fd0ff';
  const mats = useMemo(() => segs.map(s => new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false,
    uniforms: { uTime: time, uLen: { value: s.len }, uStart: { value: s.start }, uColor: { value: new THREE.Color(color) } },
  })), [segs, color]);
  useEffect(() => () => mats.forEach(m => m.dispose()), [mats]);
  const mat = selected ? baseMat.selected : baseMat[flow];
  return (
    <group onClick={onPick}>
      {segs.map((s, i) => (
        <group key={i} position={s.mid} quaternion={s.quat}>
          <mesh geometry={cyl} material={mat} scale={[1, s.len, 1]} castShadow />
          {flow === 'flow' && <mesh geometry={cylOver} material={mats[i]} scale={[1, s.len, 1]} renderOrder={2} />}
        </group>
      ))}
      {pts.slice(1, -1).map((p, i) => <mesh key={i} geometry={elbow} material={mat} position={p} />)}
      {ends.map((e, i) => (
        <mesh key={i} geometry={flange} material={mat} position={e.pos.clone().addScaledVector(e.dir, 0.03)}
          quaternion={new THREE.Quaternion().setFromUnitVectors(UP, e.dir)} />
      ))}
    </group>
  );
}

export function Pipes({ doc, live }: { doc: LayoutDoc; live: Live }) {
  const items = useMemo(() => new Map(doc.items.map(i => [i.id, i])), [doc.items]);
  const editMode = useUi(s => s.editMode);
  const selectedPipeId = useUi(s => s.selectedPipeId);
  const tool = useUi(s => s.tool);
  useFrame((_, dt) => { time.value += dt; });
  return (
    <group>
      {doc.pipes.map(p => {
        const a = items.get(p.from.itemId), b = items.get(p.to.itemId);
        if (!a || !b) return null;
        return (
          <PipeMesh key={p.id} pipe={p} a={a} b={b} flow={pipeFlow(p, items, live)} selected={selectedPipeId === p.id}
            onPick={editMode && tool.type === 'select' ? e => { if (e.delta > 4) return; e.stopPropagation(); useUi.getState().selectPipe(p.id); } : undefined} />
        );
      })}
    </group>
  );
}

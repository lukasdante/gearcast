import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Grid, Lightformer, Line, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { getKind } from '../models/registry';
import { uid, type LayoutDoc, type LayoutItem } from '../domain/layout';
import { usePlantStore } from '../store/plantStore';
import { useUi } from '../store/uiStore';
import { ItemNode, type ItemHandlers } from './ItemNode';
import { Pipes } from './Pipes';
import { Zones, itemRect } from './Zones';
import { itemVisual, type Live } from './live';
import { findPort, portWorld, snap } from './geometry';

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/** World-space boxes of the layout items from the real model footprints / heights. */
function itemBoxes(doc: LayoutDoc): THREE.Box3[] {
  if (!doc.items.length) return [new THREE.Box3(new THREE.Vector3(-16, 0, -12), new THREE.Vector3(16, 4, 12))];
  return doc.items.map(it => {
    const r = itemRect(it);
    const h = (it.props?.elevation ?? 0) + (it.props?.proxy ? it.props.proxy[1] : getKind(it.kind).height * (it.scale ?? 1));
    return new THREE.Box3(new THREE.Vector3(r.x0, 0, r.z0), new THREE.Vector3(r.x1, h, r.z1));
  });
}
export const bounds = (doc: LayoutDoc) => itemBoxes(doc).reduce((a, b) => a.union(b), new THREE.Box3());

/** Default view direction: 3/4 view from the front-right, ~40° down. */
const VIEW_DIR = (() => {
  const el = THREE.MathUtils.degToRad(40), az = THREE.MathUtils.degToRad(12);
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
})();
const FILL = 0.85;

/**
 * Camera position / target that frames the item boxes to fill FILL of a viewport with the given aspect,
 * by projecting the box corners and iterating distance + recentring.
 */
export function frameBoxes(boxes: THREE.Box3[], fov: number, aspect: number) {
  const cam = new THREE.PerspectiveCamera(fov, aspect, 0.1, 2000);
  const box = boxes.reduce((a, b) => a.union(b), new THREE.Box3());
  const corners: THREE.Vector3[] = [];
  for (const b of boxes) for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) corners.push(new THREE.Vector3(x, y, z));
  const target = box.getCenter(new THREE.Vector3()).setY(0);
  let dist = box.getSize(new THREE.Vector3()).length();
  const extent = (d: number) => {
    cam.position.copy(target).addScaledVector(VIEW_DIR, d);
    cam.lookAt(target);
    cam.updateMatrixWorld();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const c of corners) {
      const p = c.clone().project(cam);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    return { x0, x1, y0, y1, k: Math.max((x1 - x0) / 2, (y1 - y0) / 2) / FILL };
  };
  for (let pass = 0; pass < 4; pass++) {
    let lo = 2, hi = 2000;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (extent(mid).k > 1) lo = mid; else hi = mid; }
    dist = hi;
    // recentre: move the target so the projected box is centred, keeping it on the ground
    const e = extent(dist);
    const cx = (e.x0 + e.x1) / 2, cy = (e.y0 + e.y1) / 2;
    const th = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * dist;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    target.addScaledVector(right, cx * th * aspect).addScaledVector(up, cy * th);
    target.addScaledVector(VIEW_DIR, -target.y / VIEW_DIR.y);
  }
  return { pos: target.clone().addScaledVector(VIEW_DIR, dist), target };
}

/** Smooth fly-to for selection and Fit; cancelled when the user grabs the camera. */
function CameraRig({ doc }: { doc: LayoutDoc }) {
  const camera = useThree(s => s.camera);
  const controls = useThree(s => s.controls) as OrbitControlsImpl | null;
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const fitSeq = useUi(s => s.fitSeq);
  const size = useThree(s => s.size);
  // Side panels (palette left, inspector right) cover the canvas: shift the projection centre into the visible area.
  const panelR = useUi(s => (s.editMode ? !!(s.selectedItemId || s.selectedPipeId) : !!(s.selectedItemId || s.selectedAssetId)) ? 390 : 0);
  const panelL = useUi(s => (s.editMode ? 250 : 0));
  const offset = useRef({ l: 0, r: 0 });
  const selectedItemId = useUi(s => s.selectedItemId);
  const editMode = useUi(s => s.editMode);
  const docRef = useRef(doc);
  docRef.current = doc;

  const fit = (instant = false) => {
    const persp = camera as THREE.PerspectiveCamera;
    const aspect = Math.max(0.5, (size.width - panelL - panelR) / size.height);
    const { pos, target } = frameBoxes(itemBoxes(docRef.current), persp.fov, aspect);
    if (instant && controls) { camera.position.copy(pos); controls.target.copy(target); controls.update(); }
    else goal.current = { pos, target };
  };

  useEffect(() => { if (controls) fit(true); }, [controls, doc.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (fitSeq) fit(); }, [fitSeq]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selectedItemId || editMode || !controls) return;
    const it = docRef.current.items.find(i => i.id === selectedItemId);
    if (!it) return;
    const h = getKind(it.kind).height * (it.scale ?? 1) + (it.props?.elevation ?? 0);
    const target = new THREE.Vector3(it.position[0], h * 0.45, it.position[1]);
    const dir = camera.position.clone().sub(controls.target).normalize();
    if (dir.y < 0.35) { dir.y = 0.35; dir.normalize(); }
    const dist = Math.max(13, Math.max(...getKind(it.kind).footprint) * (it.scale ?? 1) * 2.6);
    goal.current = { pos: target.clone().addScaledVector(dir, dist), target };
  }, [selectedItemId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!controls) return;
    const cancel = () => { goal.current = null; };
    controls.addEventListener('start', cancel);
    return () => controls.removeEventListener('start', cancel);
  }, [controls]);

  useFrame((_, dt) => {
    const o = offset.current;
    const k0 = 1 - Math.exp(-dt * 10);
    const nl = Math.abs(panelL - o.l) < 0.5 ? panelL : o.l + (panelL - o.l) * k0;
    const nr = Math.abs(panelR - o.r) < 0.5 ? panelR : o.r + (panelR - o.r) * k0;
    const persp = camera as THREE.PerspectiveCamera;
    const fullW = size.width + nl + nr;
    if (nl !== o.l || nr !== o.r || persp.view?.fullWidth !== fullW || persp.view?.height !== size.height) {
      o.l = nl; o.r = nr;
      persp.aspect = fullW / size.height;
      persp.setViewOffset(fullW, size.height, nr, 0, size.width, size.height);
      persp.updateProjectionMatrix();
    }
    const g = goal.current;
    if (!g || !controls) return;
    const k = 1 - Math.exp(-dt * 4.5);
    camera.position.lerp(g.pos, k);
    controls.target.lerp(g.target, k);
    controls.update();
    if (camera.position.distanceTo(g.pos) < 0.05 && controls.target.distanceTo(g.target) < 0.05) goal.current = null;
  });
  return null;
}

/** Builder: ground pointer tracking, ghost placement, pipe preview, port markers. */
function BuilderLayer({ doc }: { doc: LayoutDoc }) {
  const tool = useUi(s => s.tool);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const edit = usePlantStore(s => s.edit);
  const ghostDef = tool.type === 'place' ? getKind(tool.kind) : null;
  const items = useMemo(() => new Map(doc.items.map(i => [i.id, i])), [doc.items]);

  const fromPos = tool.type === 'pipe' && tool.from ? (() => {
    const it = items.get(tool.from.itemId);
    return it ? portWorld(it, findPort(it, tool.from.port, 'out')).pos : null;
  })() : null;

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={0.001} visible={false}
        onPointerMove={e => setCursor([snap(e.point.x), snap(e.point.z)])}
        onPointerOut={() => setCursor(null)}
        onClick={e => {
          if (e.delta > 4) return;
          if (tool.type === 'place') {
            e.stopPropagation();
            const def = getKind(tool.kind);
            const id = uid(tool.kind);
            const p: [number, number] = [snap(e.point.x), snap(e.point.z)];
            const item: LayoutItem = { id, kind: tool.kind, label: def.label, position: p, rotationY: 0,
              ...(tool.kind === 'custom' ? { props: { color: '#6b7b8f', size: [2, 1.5, 2] as [number, number, number] } } : {}) };
            edit(d => ({ ...d, items: [...d.items, item] }));
            useUi.getState().select(id);
          } else if (tool.type === 'select') useUi.getState().select(null);
        }}>
        <planeGeometry args={[400, 400]} />
        <meshBasicMaterial />
      </mesh>
      {ghostDef && cursor && (
        <group position={[cursor[0], 0, cursor[1]]}>
          <ghostDef.Component state="ghost" statusColor="#2fd0c1" />
          <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
            <planeGeometry args={ghostDef.footprint} />
            <meshBasicMaterial color="#2fd0c1" transparent opacity={0.18} depthWrite={false} />
          </mesh>
        </group>
      )}
      {tool.type === 'pipe' && doc.items.flatMap(it => getKind(it.kind).ports.map(p => {
        const w = portWorld(it, p);
        const active = tool.from?.itemId === it.id && tool.from.port === p.id;
        return (
          <mesh key={it.id + p.id} position={w.pos}
            onClick={e => { e.stopPropagation(); pickPort(it, p.id); }}>
            <sphereGeometry args={[0.2, 16, 12]} />
            <meshBasicMaterial color={active ? '#ffffff' : p.id.startsWith('out') ? '#2fd0c1' : '#4b9dff'} transparent opacity={0.9} depthTest={false} />
          </mesh>
        );
      }))}
      {fromPos && cursor && (
        <Line points={[fromPos, [cursor[0], fromPos.y, cursor[1]]]} color="#2fd0c1" lineWidth={2} dashed dashSize={0.3} gapSize={0.2} />
      )}
    </group>
  );
}

/** Pipe tool: first pick = from, second pick (other item) = to. */
export function pickPort(item: LayoutItem, port: string) {
  const ui = useUi.getState();
  const tool = ui.tool;
  if (tool.type !== 'pipe') return;
  if (!getKind(item.kind).ports.length) return; // e.g. motors: nothing to connect
  if (!tool.from) { ui.setTool({ type: 'pipe', from: { itemId: item.id, port } }); return; }
  if (tool.from.itemId === item.id) { ui.setTool({ type: 'pipe' }); return; }
  const from = tool.from;
  usePlantStore.getState().edit(d => ({ ...d, pipes: [...d.pipes, { id: uid('pipe'), from, to: { itemId: item.id, port }, flow: 'wastewater' }] }));
  ui.setTool({ type: 'pipe' });
}

function nearestPort(item: LayoutItem, point: THREE.Vector3, prefer: 'in' | 'out') {
  const all = getKind(item.kind).ports;
  if (!all.length) return prefer;
  // source picks an outlet, destination an inlet, when the kind has one
  const ports = all.some(p => p.id.startsWith(prefer)) ? all.filter(p => p.id.startsWith(prefer)) : all;
  let best = ports[0], bd = Infinity;
  for (const p of ports) {
    const d = portWorld(item, p).pos.distanceTo(point);
    if (d < bd) { bd = d; best = p; }
  }
  return best.id;
}

/** Dev-only hooks for the Playwright screenshot script. */
function DevHooks({ doc }: { doc: LayoutDoc }) {
  const camera = useThree(s => s.camera);
  const size = useThree(s => s.size);
  const gl = useThree(s => s.gl);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as Record<string, unknown>;
    w.__gcProject = (x: number, y: number, z: number) => {
      const v = new THREE.Vector3(x, y, z).project(camera);
      const r = gl.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * size.width, y: r.top + ((1 - v.y) / 2) * size.height };
    };
    w.__gcItemPos = (id: string) => doc.items.find(i => i.id === id || i.assetId === id)?.position;
    w.__gcLastItem = () => doc.items[doc.items.length - 1]?.id;
    w.__gcSelect = (assetId: string) => {
      const it = doc.items.find(i => i.assetId === assetId);
      useUi.getState().select(it?.id ?? null, assetId);
    };
  }, [camera, size, gl, doc]);
  return null;
}

function SceneContent({ doc, live }: { doc: LayoutDoc; live: Live }) {
  const selectedItemId = useUi(s => s.selectedItemId);
  const selectedAssetId = useUi(s => s.selectedAssetId);
  const hoveredItemId = useUi(s => s.hoveredItemId);
  const editMode = useUi(s => s.editMode);
  const controls = useThree(s => s.controls) as OrbitControlsImpl | null;
  const gl = useThree(s => s.gl);
  const drag = useRef<{ id: string; dx: number; dz: number; moved: boolean } | null>(null);

  const handlers = useMemo<ItemHandlers>(() => ({
    onHover: it => {
      useUi.getState().hover(it?.id ?? null);
      gl.domElement.style.cursor = it ? (useUi.getState().editMode && useUi.getState().tool.type === 'select' ? 'grab' : 'pointer') : '';
    },
    onClick: (it, e) => {
      if (e.delta > 4) return;
      e.stopPropagation();
      const ui = useUi.getState();
      if (ui.editMode && ui.tool.type === 'pipe') { pickPort(it, nearestPort(it, e.point, ui.tool.from ? 'in' : 'out')); return; }
      if (ui.editMode && ui.tool.type === 'place') return;
      ui.select(it.id, it.assetId ?? null);
    },
    onPointerDown: (it, e) => {
      const ui = useUi.getState();
      if (!ui.editMode || ui.tool.type !== 'select' || e.button !== 0) return;
      e.stopPropagation();
      const hit = e.ray.intersectPlane(GROUND, new THREE.Vector3());
      if (!hit) return;
      drag.current = { id: it.id, dx: it.position[0] - hit.x, dz: it.position[1] - hit.z, moved: false };
      (e.target as unknown as Element).setPointerCapture(e.pointerId);
      if (controls) controls.enabled = false;
      gl.domElement.style.cursor = 'grabbing';
    },
    onPointerMove: (it, e) => {
      const d = drag.current;
      if (!d || d.id !== it.id) return;
      const hit = e.ray.intersectPlane(GROUND, new THREE.Vector3());
      if (!hit) return;
      const p: [number, number] = [snap(hit.x + d.dx), snap(hit.z + d.dz)];
      if (p[0] === it.position[0] && p[1] === it.position[1]) return;
      const store = usePlantStore.getState();
      if (!d.moved) { store.snapshot(); d.moved = true; }
      store.edit(doc => ({ ...doc, items: doc.items.map(i => i.id === d.id ? { ...i, position: p } : i) }), false);
    },
    onPointerUp: (_it, e) => {
      if (!drag.current) return;
      (e.target as unknown as Element).releasePointerCapture?.(e.pointerId);
      drag.current = null;
      if (controls) controls.enabled = true;
      gl.domElement.style.cursor = 'grab';
    },
  }), [controls, gl]);

  return (
    <>
      <Zones doc={doc} live={live} />
      {doc.items.map(it => (
        <ItemNode key={it.id} item={it} vis={itemVisual(it, live)} editMode={editMode} handlers={handlers}
          selected={selectedItemId === it.id || (!!it.assetId && selectedAssetId === it.assetId)} hovered={hoveredItemId === it.id} />
      ))}
      <Pipes doc={doc} live={live} />
      {editMode && <BuilderLayer doc={doc} />}
      <CameraRig doc={doc} />
      {import.meta.env.DEV && <DevHooks doc={doc} />}
    </>
  );
}

/** Gallery key light (direction [8, 14, 6]) with its shadow camera fitted to the plant. */
function KeyLight({ doc }: { doc: LayoutDoc }) {
  const ref = useRef<THREE.DirectionalLight>(null);
  const box = useMemo(() => bounds(doc), [doc]);
  useEffect(() => {
    const l = ref.current;
    if (!l) return;
    const c = box.getCenter(new THREE.Vector3()).setY(0);
    const r = Math.max(12, box.getSize(new THREE.Vector3()).setY(0).length() / 2 + 2);
    l.position.copy(c).add(new THREE.Vector3(8, 14, 6).normalize().multiplyScalar(r * 2));
    l.target.position.copy(c);
    l.target.updateMatrixWorld();
    const sc = l.shadow.camera;
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 1; sc.far = r * 4;
    sc.updateProjectionMatrix();
  }, [box]);
  return (
    <directionalLight ref={ref} castShadow intensity={2.2} shadow-mapSize={[4096, 4096]}
      shadow-bias={-0.0004} shadow-normalBias={0.02} />
  );
}

export function Scene({ doc, live }: { doc: LayoutDoc; live: Live }) {
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [10, 45, 55], fov: 40, near: 0.3, far: 600 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      onPointerMissed={() => { if (!useUi.getState().editMode || useUi.getState().tool.type === 'select') useUi.getState().select(null); }}>
      <color attach="background" args={['#0b0f14']} />
      <fog attach="fog" args={['#0b0f14', 120, 300]} />
      {/* Same rig as the model gallery: hemisphere + warm key + cool fill + lightformer environment */}
      <hemisphereLight args={['#b8c7d6', '#1a1f26', 0.55]} />
      <KeyLight doc={doc} />
      <directionalLight position={[-10, 6, -8]} intensity={0.5} color="#9fb4c8" />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2} position={[0, 6, 4]} scale={[12, 3, 1]} />
        <Lightformer form="rect" intensity={1} color="#a8c2dd" position={[-6, 3, -4]} scale={[8, 2, 1]} />
        <Lightformer form="ring" intensity={1.2} position={[6, 4, -2]} scale={3} />
      </Environment>
      <mesh rotation-x={-Math.PI / 2} receiveShadow position-y={-0.01}>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color="#141a21" roughness={0.95} metalness={0} />
      </mesh>
      <Grid position={[0, 0.002, 0]} args={[400, 400]} cellSize={1} cellThickness={0.6} cellColor="#18212c"
        sectionSize={5} sectionThickness={1} sectionColor="#223041" fadeDistance={320} fadeStrength={1.4} infiniteGrid />
      <SceneContent doc={doc} live={live} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI / 2.3} minPolarAngle={0.12} minDistance={4} maxDistance={200}
        screenSpacePanning={false} />
    </Canvas>
  );
}

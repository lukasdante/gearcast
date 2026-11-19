/**
 * Standalone model gallery (gallery.html): every asset kind on a dark ground with state / selection toggles.
 * URL params: ?focus=<kind> frames one kind; ?state=<VisualState>; ?selected=1; ?hovered=1; ?level=0.6
 */
import { StrictMode, Suspense, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment, Html, Lightformer, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { ASSET_KINDS } from './registry';
import type { AssetKindDef, VisualState } from './types';

const STATES: VisualState[] = ['running', 'standby', 'maintenance', 'fault', 'stored', 'ghost'];
const STATUS: Record<VisualState, string> = {
  running: '#2fd27a', standby: '#4aa3ff', maintenance: '#ffb020', fault: '#ff3b30', stored: '#8a96a3', ghost: '#3fb8ff',
};
const q = new URLSearchParams(location.search);

/** Shelf-pack kinds into rows (small machinery first) so everything is visible at once. */
function layout(kinds: AssetKindDef[]) {
  const sorted = [...kinds].sort((a, b) => a.footprint[0] * a.footprint[1] - b.footprint[0] * b.footprint[1]);
  const out: { k: AssetKindDef; x: number; z: number }[] = [];
  let x = 0, z = 0, rowDepth = 0;
  const maxW = 26, gap = 1.6;
  for (const k of sorted) {
    const [w, d] = k.footprint;
    if (x + w > maxW) { x = 0; z += rowDepth + gap * 2; rowDepth = 0; }
    out.push({ k, x: x + w / 2, z: z + d / 2 });
    x += w + gap;
    rowDepth = Math.max(rowDepth, d);
  }
  const cx = Math.max(...out.map(o => o.x)) / 2, cz = (z + rowDepth) / 2;
  return out.map(o => ({ ...o, x: o.x - cx, z: o.z - cz }));
}

function Gallery() {
  const focus = q.get('focus');
  const [state, setState] = useState<VisualState>((q.get('state') as VisualState) ?? 'running');
  const [selected, setSelected] = useState(q.get('selected') === '1');
  const [hovered, setHovered] = useState(q.get('hovered') === '1');
  const [level, setLevel] = useState(Number(q.get('level') ?? 0.7));
  const [labels, setLabels] = useState(q.get('labels') !== '0');
  const kinds = focus ? ASSET_KINDS.filter(k => k.kind === focus) : ASSET_KINDS;
  const items = useMemo(() => (focus ? kinds.map(k => ({ k, x: 0, z: 0 })) : layout(kinds)), [focus, kinds]);
  const span = focus ? Math.max(...kinds[0].footprint, kinds[0].height) : 30;
  const cam: [number, number, number] = focus ? [span * 1.5, span * 1.0, span * 1.8] : [15, 21, 30];

  return (
    <>
      <Canvas shadows dpr={[1, 2]} camera={{ position: cam, fov: 40, near: 0.05, far: 400 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, preserveDrawingBuffer: true }}>
        <color attach="background" args={['#0b0f14']} />
        <fog attach="fog" args={['#0b0f14', 40, 90]} />
        <hemisphereLight args={['#b8c7d6', '#1a1f26', 0.55]} />
        <directionalLight position={[8, 14, 6]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20}
          shadow-bias={-0.0004} shadow-normalBias={0.02} />
        <directionalLight position={[-10, 6, -8]} intensity={0.5} color="#9fb4c8" />
        <Environment resolution={128} frames={1}>
          <Lightformer form="rect" intensity={2} position={[0, 6, 4]} scale={[12, 3, 1]} />
          <Lightformer form="rect" intensity={1} color="#a8c2dd" position={[-6, 3, -4]} scale={[8, 2, 1]} />
          <Lightformer form="ring" intensity={1.2} position={[6, 4, -2]} scale={3} />
        </Environment>
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[200, 200]} />
          <meshStandardMaterial color="#141a21" roughness={0.95} metalness={0} />
        </mesh>
        <gridHelper args={[60, 60, '#1f2933', '#18202a']} position={[0, 0.002, 0]} />
        <Suspense fallback={null}>
          {items.map(({ k, x, z }) => (
            <group key={k.kind} position={[x, 0, z]}>
              <k.Component state={state} statusColor={STATUS[state]} selected={selected} hovered={hovered} level={level} />
              {labels && (
                <Html position={[0, k.height + 0.25, 0]} center distanceFactor={focus ? undefined : 14}
                  style={{ pointerEvents: 'none', whiteSpace: 'nowrap', fontSize: 12, color: '#d7e0e8',
                    background: 'rgba(11,15,20,.75)', padding: '2px 6px', borderRadius: 4, border: '1px solid #243140' }}>
                  {k.label}
                </Html>
              )}
            </group>
          ))}
          <ContactShadows position={[0, 0.003, 0]} scale={70} opacity={0.5} blur={2.2} far={6} resolution={1024} />
        </Suspense>
        <OrbitControls makeDefault target={[0, focus ? kinds[0].height * 0.4 : 0, 0]} maxPolarAngle={Math.PI / 2.05} />
      </Canvas>
      <div style={{ position: 'fixed', top: 12, left: 12, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
        background: 'rgba(11,15,20,.85)', padding: 8, borderRadius: 8, border: '1px solid #243140' }}>
        <b style={{ marginRight: 6 }}>GearCast models</b>
        {STATES.map(s => (
          <button key={s} onClick={() => setState(s)} style={{ background: s === state ? STATUS[s] : '#18212b',
            color: s === state ? '#0b0f14' : '#c9d3dc', border: '1px solid #2c3a48', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}>{s}</button>
        ))}
        <label><input type="checkbox" checked={selected} onChange={e => setSelected(e.target.checked)} /> selected</label>
        <label><input type="checkbox" checked={hovered} onChange={e => setHovered(e.target.checked)} /> hovered</label>
        <label><input type="checkbox" checked={labels} onChange={e => setLabels(e.target.checked)} /> labels</label>
        <label>level <input type="range" min={0} max={1} step={0.05} value={level} onChange={e => setLevel(Number(e.target.value))} /></label>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Gallery /></StrictMode>);

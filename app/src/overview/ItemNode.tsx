import { Suspense, memo, useRef } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { getKind } from '../models/registry';
import type { LayoutItem } from '../domain/layout';
import type { ItemVisual } from './live';
import { itemRect } from './Zones';

// Camera distance (m) beyond which tags fade: main units stay longer than motors / spares.
const LABEL_NEAR = { main: 95, minor: 40 };
const isMinor = (it: LayoutItem) => !it.assetId || /^(M-|VM-|SP-)/.test(it.assetId);

export interface ItemHandlers {
  onClick: (item: LayoutItem, e: ThreeEvent<MouseEvent>) => void;
  onPointerDown: (item: LayoutItem, e: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (item: LayoutItem, e: ThreeEvent<PointerEvent>) => void;
  onPointerUp: (item: LayoutItem, e: ThreeEvent<PointerEvent>) => void;
  onHover: (item: LayoutItem | null) => void;
}

/** Footprint outline on the ground for hover / selection. */
function Footprint({ item, color, opacity }: { item: LayoutItem; color: string; opacity: number }) {
  const r = itemRect(item);
  const w = r.x1 - r.x0 + 0.4, d = r.z1 - r.z0 + 0.4;
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

/** Light stand-in while a GLB-backed model loads. */
function LoadingBox({ fx, fz, h }: { fx: number; fz: number; h: number }) {
  return (
    <mesh position-y={h / 2}>
      <boxGeometry args={[fx, h, fz]} />
      <meshStandardMaterial color="#2a3442" transparent opacity={0.5} roughness={0.9} />
    </mesh>
  );
}

function AssetLabel({ item, vis, selected, hovered, height }: { item: LayoutItem; vis: ItemVisual; selected: boolean; hovered: boolean; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const camera = useThree(s => s.camera);
  const pos = useRef(new THREE.Vector3(item.position[0], height, item.position[1]));
  pos.current.set(item.position[0], height, item.position[1]);
  const fault = vis.state === 'fault';
  const force = selected || hovered || fault;
  useFrame(() => {
    const el = ref.current;
    if (!el) return;
    const d = camera.position.distanceTo(pos.current);
    const show = force || d < LABEL_NEAR[isMinor(item) ? 'minor' : 'main'];
    el.style.opacity = show ? '1' : '0';
    el.style.transform = `translate(-50%, -100%) scale(${show ? Math.max(0.8, Math.min(1, 55 / d)) : 0.8})`;
  });
  const v = vis.view;
  return (
    <Html position={pos.current.toArray()} zIndexRange={[14, 0]} style={{ pointerEvents: 'none' }}>
      <div ref={ref} className={`asset-label k-${v?.key ?? 'none'}${selected ? ' sel' : ''}`}>
        <span className="dot" />
        <span className="mono">{item.assetId ?? item.label}</span>
        {v && <span className="chip">{v.chip}</span>}
      </div>
    </Html>
  );
}

export const ItemNode = memo(function ItemNode({ item, vis, selected, hovered, editMode, handlers }: {
  item: LayoutItem; vis: ItemVisual; selected: boolean; hovered: boolean; editMode: boolean; handlers: ItemHandlers;
}) {
  const def = getKind(item.kind);
  const C = def.Component;
  const elev = item.props?.elevation ?? 0;
  const s = item.scale ?? 1;
  const showLabel = !!item.assetId || (editMode && !item.assetId) || !item.props?.nodeId;
  return (
    <>
    <group position={[item.position[0], 0, item.position[1]]}>
      <group
        position-y={elev}
        rotation-y={item.rotationY}
        onClick={e => handlers.onClick(item, e)}
        onPointerDown={e => handlers.onPointerDown(item, e)}
        onPointerMove={e => handlers.onPointerMove(item, e)}
        onPointerUp={e => handlers.onPointerUp(item, e)}
        onPointerOver={e => { e.stopPropagation(); handlers.onHover(item); }}
        onPointerOut={() => handlers.onHover(null)}
      >
        <Suspense fallback={<LoadingBox fx={def.footprint[0] * s} fz={def.footprint[1] * s} h={def.height * s} />}>
          <C state={vis.state} statusColor={vis.color} selected={selected} hovered={hovered} level={vis.level} scale={s} />
        </Suspense>
      </group>
      {(selected || hovered) && elev === 0 && <Footprint item={item} color={selected ? '#2fd0c1' : '#9fb3c8'} opacity={selected ? 0.22 : 0.12} />}
    </group>
    {showLabel && <AssetLabel item={item} vis={vis} selected={selected} hovered={hovered} height={elev + def.height * s + 0.35} />}
    </>
  );
});

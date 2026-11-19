import { Suspense, memo, useRef } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { getKind } from '../models/registry';
import type { LayoutItem } from '../domain/layout';
import { useUi } from '../store/uiStore';
import type { ItemVisual } from './live';

// Camera distance (m) within which asset tags show; beyond it only area labels remain
// (selected / hovered / faulted tags always show).
const LABEL_NEAR = { main: 34, minor: 22 };
const isMinor = (it: LayoutItem) => !it.assetId || /^(M-|VM-|SP-)/.test(it.assetId);

export interface ItemHandlers {
  onClick: (item: LayoutItem, e: ThreeEvent<MouseEvent>) => void;
  onPointerDown: (item: LayoutItem, e: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (item: LayoutItem, e: ThreeEvent<PointerEvent>) => void;
  onPointerUp: (item: LayoutItem, e: ThreeEvent<PointerEvent>) => void;
  onHover: (item: LayoutItem | null) => void;
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

/**
 * Click target for an asset drawn as part of another model (e.g. vibrator motors on a screen's drive beam):
 * invisible unless hovered / selected.
 */
function Proxy({ size, color, selected, hovered }: { size: [number, number, number]; color: string; selected: boolean; hovered: boolean }) {
  const show = selected || hovered;
  return (
    <mesh position-y={size[1] / 2}>
      <boxGeometry args={size} />
      <meshBasicMaterial color={selected ? '#2fd0c1' : color} transparent opacity={show ? 0.28 : 0} depthWrite={false} />
    </mesh>
  );
}

function AssetLabel({ item, vis, selected, hovered, height }: { item: LayoutItem; vis: ItemVisual; selected: boolean; hovered: boolean; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const camera = useThree(s => s.camera);
  const pos = useRef(new THREE.Vector3(item.position[0], height, item.position[1]));
  pos.current.set(item.position[0], height, item.position[1]);
  const force = selected || hovered || vis.state === 'fault';
  useFrame(() => {
    const el = ref.current;
    if (!el) return;
    const d = camera.position.distanceTo(pos.current);
    const show = force || d < LABEL_NEAR[isMinor(item) ? 'minor' : 'main'];
    el.style.opacity = show ? '1' : '0';
    el.style.pointerEvents = show ? 'auto' : 'none';
    el.style.transform = `translate(-50%, -100%) scale(${show ? Math.max(0.82, Math.min(1, 30 / d)) : 0.8})`;
  });
  const v = vis.view;
  const pick = (e: React.MouseEvent) => {
    e.stopPropagation(); // the label sits inside R3F's event container: don't let the canvas raycast this click
    const ui = useUi.getState();
    if (ui.editMode && ui.tool.type !== 'select') return;
    ui.select(item.id, item.assetId ?? null);
  };
  return (
    <Html position={pos.current.toArray()} zIndexRange={[14, 0]} style={{ pointerEvents: 'none' }}>
      <div ref={ref} className={`asset-label k-${v?.key ?? 'none'}${selected ? ' sel' : ''}`} onClick={pick}
        onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}
        onPointerEnter={() => useUi.getState().hover(item.id)} onPointerLeave={() => useUi.getState().hover(null)}>
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
  const proxy = item.props?.proxy;
  const showLabel = !!item.assetId || (editMode && !item.assetId) || !item.props?.nodeId;
  const labelY = item.props?.labelY ?? elev + (proxy ? proxy[1] : def.height * s) + 0.3;
  return (
    <>
      <group position={[item.position[0], elev, item.position[1]]} rotation-y={item.rotationY}
        onClick={e => handlers.onClick(item, e)}
        onPointerDown={e => handlers.onPointerDown(item, e)}
        onPointerMove={e => handlers.onPointerMove(item, e)}
        onPointerUp={e => handlers.onPointerUp(item, e)}
        onPointerOver={e => { e.stopPropagation(); handlers.onHover(item); }}
        onPointerOut={() => handlers.onHover(null)}
      >
        {proxy ? <Proxy size={proxy} color={vis.color} selected={selected} hovered={hovered} /> : (
          <Suspense fallback={<LoadingBox fx={def.footprint[0] * s} fz={def.footprint[1] * s} h={def.height * s} />}>
            <C state={vis.state} statusColor={vis.color} selected={selected} hovered={hovered} level={vis.level} scale={s} />
          </Suspense>
        )}
      </group>
      {showLabel && <AssetLabel item={item} vis={vis} selected={selected} hovered={hovered} height={labelY} />}
    </>
  );
});

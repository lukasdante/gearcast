import { useMemo } from 'react';
import { Html, Line } from '@react-three/drei';
import { getKind } from '../models/registry';
import { areaName, itemNode, type LayoutDoc, type LayoutItem } from '../domain/layout';
import type { Live } from './live';
import { useUi } from '../store/uiStore';

const PAD = 1.1;

/** Axis-aligned footprint of an item on the ground (rotation in 90° steps). */
export function itemRect(it: LayoutItem) {
  const def = getKind(it.kind);
  const s = it.scale ?? 1;
  const size = it.kind === 'custom' && it.props?.size ? [it.props.size[0], it.props.size[2]] : def.footprint;
  const quarter = Math.round(it.rotationY / (Math.PI / 2)) % 2 !== 0;
  const [fx, fz] = quarter ? [size[1] * s, size[0] * s] : [size[0] * s, size[1] * s];
  return { x0: it.position[0] - fx / 2, x1: it.position[0] + fx / 2, z0: it.position[1] - fz / 2, z1: it.position[1] + fz / 2 };
}

export interface Zone { nodeId: string; x0: number; x1: number; z0: number; z1: number; itemIds: string[] }

export function computeZones(doc: LayoutDoc): Zone[] {
  const m = new Map<string, Zone>();
  for (const it of doc.items) {
    const n = itemNode(it);
    if (!n) continue;
    const r = itemRect(it);
    const z = m.get(n);
    if (!z) m.set(n, { nodeId: n, ...r, itemIds: [it.id] });
    else { z.x0 = Math.min(z.x0, r.x0); z.x1 = Math.max(z.x1, r.x1); z.z0 = Math.min(z.z0, r.z0); z.z1 = Math.max(z.z1, r.z1); z.itemIds.push(it.id); }
  }
  return [...m.values()].map(z => ({ ...z, x0: z.x0 - PAD, x1: z.x1 + PAD, z0: z.z0 - PAD, z1: z.z1 + PAD }));
}

function roundedRect(z: Zone, r = 0.8, y = 0.02): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const corners: [number, number, number][] = [
    [z.x1 - r, z.z0 + r, -Math.PI / 2], [z.x1 - r, z.z1 - r, 0], [z.x0 + r, z.z1 - r, Math.PI / 2], [z.x0 + r, z.z0 + r, Math.PI],
  ];
  for (const [cx, cz, a0] of corners) for (let i = 0; i <= 6; i++) {
    const a = a0 + (i / 6) * (Math.PI / 2);
    pts.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]);
  }
  pts.push(pts[0]);
  return pts;
}

const STYLE = {
  ok: { line: '#3a4a5e', fill: '#1a2533', opacity: 0.35 },
  changeover: { line: '#f2b53b', fill: '#f2b53b', opacity: 0.06 },
  affected: { line: '#f2b53b', fill: '#f2b53b', opacity: 0.05 },
  down: { line: '#f05252', fill: '#f05252', opacity: 0.12 },
};

export function Zones({ doc, live }: { doc: LayoutDoc; live: Live }) {
  const zones = useMemo(() => computeZones(doc), [doc]);
  const select = useUi(s => s.select);
  const editMode = useUi(s => s.editMode);
  return (
    <group>
      {zones.map(z => {
        const ns = live.impact.nodeState[z.nodeId] ?? 'ok';
        const st = STYLE[ns];
        const rising = live.impact.levelRising.has(z.nodeId);
        const tag = z.nodeId.match(/^W\d+$/) ? z.nodeId : null;
        const firstStructure = doc.items.find(i => z.itemIds.includes(i.id) && !i.assetId);
        return (
          <group key={z.nodeId}>
            <mesh rotation-x={-Math.PI / 2} position={[(z.x0 + z.x1) / 2, 0.012, (z.z0 + z.z1) / 2]} receiveShadow>
              <planeGeometry args={[z.x1 - z.x0, z.z1 - z.z0]} />
              <meshStandardMaterial color={st.fill} transparent opacity={st.opacity} depthWrite={false} />
            </mesh>
            <Line points={roundedRect(z)} color={st.line} lineWidth={ns === 'ok' ? 1.2 : 2} dashed={ns === 'affected'} dashSize={0.6} gapSize={0.4} />
            <Html position={[z.x0 + 0.3, 0.05, z.z0 + 0.1]} zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
              <div className={`zone-label ${ns}`}
                onClick={() => !editMode && firstStructure && select(firstStructure.id)}
                style={{ pointerEvents: !editMode && firstStructure ? 'auto' : 'none' }}>
                {tag && <span className="mono zone-tag">{tag}</span>}
                <span className="zone-name">{areaName(z.nodeId)}</span>
                {ns === 'down' && <span className="zone-state down">PROCESS DOWN</span>}
                {ns === 'affected' && <span className="zone-state affected">NO FLOW</span>}
                {ns === 'changeover' && <span className="zone-state affected">DUTY DOWN · START STANDBY</span>}
                {rising && <span className="zone-state affected">LEVEL RISING</span>}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

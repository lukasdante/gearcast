/**
 * Plant layout document (plain serialisable JSON — will move to a backend later)
 * and the default "Franklin Baker WWTP" seeded from the prototype's 2D mimic layout.
 */
import { PLANT, assetById, nodeById } from '../data';
import { getKind } from '../models/registry';

export interface PortRef { itemId: string; port: string }
export interface LayoutItem {
  id: string;
  kind: string;
  assetId?: string;
  label: string;
  position: [number, number]; // world x, z (metres)
  rotationY: number;          // radians, multiples of π/2 in the builder
  scale?: number;
  props?: {
    nodeId?: string;      // process area this item belongs to (unbound structures)
    elevation?: number;   // metres above ground (e.g. pump standing on a sump floor)
    labelY?: number;      // tag height override (e.g. raise a submersible's tag above its sump)
    /** Drawn as part of another model: render only an invisible click box [x, y, z] (m) instead of the kind's model. */
    proxy?: [number, number, number];
    color?: string;       // custom kind
    size?: [number, number, number]; // custom kind [x, y, z]
  };
}
export interface LayoutPipe { id: string; from: PortRef; to: PortRef; flow?: 'wastewater' | 'sludge' }
export interface LayoutDoc { id: string; name: string; items: LayoutItem[]; pipes: LayoutPipe[]; updatedAt?: string }

export const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

/** Node (process area) an item belongs to. */
export const itemNode = (it: LayoutItem): string | undefined =>
  it.props?.nodeId ?? (it.assetId ? assetById.get(it.assetId)?.location_node ?? undefined : undefined);

export const AREA_NAMES: Record<string, string> = {
  PRODUCTION: 'Production & Utilities',
  STORE: 'Spares store',
  ...Object.fromEntries(PLANT.nodes.filter(n => n.area === 'WWTP').map(n => [n.node_id, n.node_name])),
};
export const areaName = (nodeId: string) => AREA_NAMES[nodeId] ?? nodeById.get(nodeId)?.node_name ?? nodeId;

// ---------------------------------------------------------------- default plant

/**
 * Compact site laid out on the real model footprints (models/kinds/meta.ts), ~3.5 m access
 * spacing, flow left → right along z ≈ 0:
 * Production → W01 sump → W02 screens → W03 separator → W04 EQ tank → W05 pump room → W06 → W07 → W08,
 * spares store beside the pump room.
 */
export function buildDefaultPlant(): LayoutDoc {
  const items: LayoutItem[] = [];
  const pipes: LayoutPipe[] = [];
  const add = (id: string, kind: string, label: string, position: [number, number], extra: Partial<LayoutItem> = {}) =>
    items.push({ id, kind, label, position, rotationY: 0, ...extra });
  const area = (id: string, kind: string, label: string, position: [number, number], nodeId = id, rotationY = 0) =>
    add(id, kind, label, position, { props: { nodeId }, rotationY });
  const asset = (assetId: string, kind: string, position: [number, number], extra: Partial<LayoutItem> = {}) =>
    add(assetId, kind, assetId, position, { assetId, ...extra });
  const pipe = (from: string, to: string, flow: LayoutPipe['flow'] = 'wastewater') =>
    pipes.push({ id: `pipe-${from}-${to}`, from: { itemId: from, port: 'out' }, to: { itemId: to, port: 'in' }, flow });

  const half = (k: string) => getKind(k).footprint[0] / 2;
  const sumpH = getKind('sump').height;

  // Production & utilities (N01–N17): two halls behind the head of works, drains facing the sump
  area('bld-production', 'building', 'Production halls', [-30.5, -12.5], 'PRODUCTION', -Math.PI / 2);
  area('bld-utilities', 'building', 'Utilities (CIP, boiler)', [-20.5, -12.5], 'PRODUCTION', -Math.PI / 2);

  // W01 raw-water sump (above-grade chamber, 1.2 m walls): submersibles stand in the open-grating bay,
  // seated slightly into the floor so they sit under the grating in the liquid; tags raised above the chamber.
  const SX = -27.5, PUMP_Y = -0.25;
  area('W01', 'sump', 'Raw-water collection sump', [SX, 0]);
  asset('P-201A', 'pump_submersible', [SX - 0.7, -0.85], { props: { elevation: PUMP_Y, labelY: sumpH + 0.4 } });
  asset('P-201B', 'pump_submersible', [SX - 0.7, 0.85], { props: { elevation: PUMP_Y, labelY: sumpH + 0.4 } });

  // W02 vibrating screens; their vibrator motors are part of the screen model, VM-101A/B are click proxies
  const CX = -19.5;
  asset('SC-101A', 'vibrating_screen', [CX, -1.6]);
  asset('SC-101B', 'vibrating_screen', [CX, 1.6]);
  asset('VM-101A', 'vibrator_motor', [CX - 0.16, -1.6], { props: { elevation: 1.28, proxy: [0.5, 0.42, 1.0], labelY: 2.8 } });
  asset('VM-101B', 'vibrator_motor', [CX - 0.16, 1.6], { props: { elevation: 1.28, proxy: [0.5, 0.42, 1.0], labelY: 2.8 } });

  // W03 – W04
  area('W03', 'separator', 'Oil & grease separator', [-12, 0]);
  area('W04', 'tank', 'Equalization tank', [-3.5, 0]);

  // W05 transfer pump room: motor coaxial on each pump's drive end (+X) with a coupling gap
  const px = 3, mx = px + half('pump_end_suction') + half('motor') + 0.08;
  asset('P-101A', 'pump_end_suction', [px, -1.3]);
  asset('M-101A', 'motor', [mx, -1.3]);
  asset('P-101B', 'pump_end_suction', [px, 1.3]);
  asset('M-101B', 'motor', [mx, 1.3]);

  // W06 – W08
  area('W06', 'bio_reactor', 'Biological reactor', [12.5, 0]);
  area('W07', 'clarifier', 'Clarifier', [24.5, 0]);
  area('W08', 'discharge', 'Treated effluent discharge', [34.5, 0]);

  // Spares store beside the pump room
  area('rack', 'spare_rack', 'Spares rack', [3.5, 7.5], 'STORE');
  ([['SP-P01', 'pump_end_suction', 1.9], ['SP-P02', 'pump_submersible', 3.3], ['SP-M01', 'motor', 4.4], ['SP-VM01', 'vibrator_motor', 5.3]] as const)
    .forEach(([id, kind, x]) => asset(id, kind, [x, 9.6]));

  // Pipes following the prototype links (L015–L039)
  pipe('bld-production', 'W01');
  pipe('bld-utilities', 'W01');
  pipe('W01', 'SC-101A');
  pipe('W01', 'SC-101B');
  pipe('SC-101A', 'W03');
  pipe('SC-101B', 'W03');
  pipe('W03', 'W04');
  pipe('W04', 'P-101A');
  pipe('W04', 'P-101B');
  pipe('P-101A', 'W06');
  pipe('P-101B', 'W06');
  pipe('W06', 'W07');
  pipe('W07', 'W08');
  pipe('W07', 'W06', 'sludge');

  return { id: 'default', name: 'Franklin Baker WWTP', items, pipes };
}

export const blankPlant = (name: string): LayoutDoc => ({ id: uid('plant'), name, items: [], pipes: [] });

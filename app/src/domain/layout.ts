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
    elevation?: number;   // metres above ground (e.g. vibrator motor on its screen)
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

const PX = 0.04; // metres per mimic pixel
const areaCentre = (ref: string): [number, number] => {
  const el = PLANT.layout.find(e => e.element_type === 'Area' && e.ref_id === ref);
  if (!el) return [0, 0];
  const x = Number(el.x) + Number(el.width) / 2;
  const y = Number(el.y) + Number(el.height) / 2;
  return [round((x - 900) * PX), round((y - 450) * PX)];
};
const round = (v: number) => Math.round(v * 2) / 2;

export function buildDefaultPlant(): LayoutDoc {
  const items: LayoutItem[] = [];
  const pipes: LayoutPipe[] = [];
  const at = (ref: string, dx = 0, dz = 0): [number, number] => {
    const [x, z] = areaCentre(ref);
    return [x + dx, z + dz];
  };
  const add = (id: string, kind: string, label: string, position: [number, number], extra: Partial<LayoutItem> = {}) =>
    items.push({ id, kind, label, position, rotationY: 0, ...extra });
  const asset = (assetId: string, kind: string, position: [number, number], extra: Partial<LayoutItem> = {}) =>
    add(assetId, kind, assetId, position, { assetId, ...extra });
  const pipe = (from: string, to: string, fp = 'out', tp = 'in', flow: LayoutPipe['flow'] = 'wastewater') =>
    pipes.push({ id: `pipe-${from}-${to}${flow === 'sludge' ? '-sl' : ''}`, from: { itemId: from, port: fp }, to: { itemId: to, port: tp }, flow });

  const screenH = getKind('vibrating_screen').height;

  // Production & utilities (N01–N17) → two buildings
  add('bld-production', 'building', 'Production halls', at('PRODUCTION', 0, -5), { props: { nodeId: 'PRODUCTION' } });
  add('bld-utilities', 'building', 'Utilities (CIP, boiler)', at('PRODUCTION', 0, 3), { props: { nodeId: 'PRODUCTION' } });
  // W01 raw-water sump with submersibles inside
  add('W01', 'sump', 'Raw-water collection sump', at('W01'), { props: { nodeId: 'W01' } });
  asset('P-201A', 'pump_submersible', at('W01', -0.9, 0.6));
  asset('P-201B', 'pump_submersible', at('W01', 0.9, 0.6));
  // W02 vibrating screens with vibrator motors mounted on top
  asset('SC-101A', 'vibrating_screen', at('W02', 0, -1.5));
  asset('SC-101B', 'vibrating_screen', at('W02', 0, 1.5));
  asset('VM-101A', 'vibrator_motor', at('W02', 0, -1.5), { props: { elevation: screenH } });
  asset('VM-101B', 'vibrator_motor', at('W02', 0, 1.5), { props: { elevation: screenH } });
  // W03 – W04
  add('W03', 'separator', 'Oil & grease separator', at('W03'), { props: { nodeId: 'W03' } });
  add('W04', 'tank', 'Equalization tank', at('W04'), { props: { nodeId: 'W04' } });
  // W05 transfer pump room: pump + coupled motor side by side
  const pumpW = getKind('pump_end_suction').footprint[0];
  const motorW = getKind('motor').footprint[0];
  asset('P-101A', 'pump_end_suction', at('W05', -motorW / 2, -1.2));
  asset('M-101A', 'motor', at('W05', pumpW / 2, -1.2));
  asset('P-101B', 'pump_end_suction', at('W05', -motorW / 2, 1.2));
  asset('M-101B', 'motor', at('W05', pumpW / 2, 1.2));
  // W06 – W08
  add('W06', 'bio_reactor', 'Biological reactor', at('W06'), { props: { nodeId: 'W06' } });
  add('W07', 'clarifier', 'Clarifier', at('W07'), { props: { nodeId: 'W07' } });
  add('W08', 'discharge', 'Treated effluent discharge', at('W08'), { props: { nodeId: 'W08' } });
  // Spares store
  add('rack', 'spare_rack', 'Spares rack', at('STORE', 0, -1.2), { props: { nodeId: 'STORE' } });
  ['SP-P01', 'SP-P02', 'SP-M01', 'SP-VM01'].forEach((id, i) => {
    const kind = id === 'SP-P01' ? 'pump_end_suction' : id === 'SP-P02' ? 'pump_submersible' : id === 'SP-M01' ? 'motor' : 'vibrator_motor';
    asset(id, kind, at('STORE', -3 + i * 2, 1));
  });

  // Pipes following the prototype links L015–L039
  pipe('bld-production', 'W01');
  pipe('bld-utilities', 'W01');
  pipe('P-201A', 'SC-101A');
  pipe('P-201B', 'SC-101B');
  pipe('SC-101A', 'W03');
  pipe('SC-101B', 'W03');
  pipe('W03', 'W04');
  pipe('W04', 'P-101A');
  pipe('W04', 'P-101B');
  pipe('P-101A', 'W06');
  pipe('P-101B', 'W06');
  pipe('W06', 'W07');
  pipe('W07', 'W08');
  pipe('W07', 'W06', 'out', 'in', 'sludge');

  return { id: 'default', name: 'Franklin Baker WWTP', items, pipes };
}

export const blankPlant = (name: string): LayoutDoc => ({ id: uid('plant'), name, items: [], pipes: [] });

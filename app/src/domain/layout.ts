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

/**
 * Compact site, flow left → right along z = 0 (positions in metres), following the
 * prototype mimic's area order: Production → W01 … W08, spares store south of the sump.
 */
export function buildDefaultPlant(): LayoutDoc {
  const items: LayoutItem[] = [];
  const pipes: LayoutPipe[] = [];
  const add = (id: string, kind: string, label: string, position: [number, number], extra: Partial<LayoutItem> = {}) =>
    items.push({ id, kind, label, position, rotationY: 0, ...extra });
  const area = (id: string, kind: string, label: string, position: [number, number], nodeId = id) =>
    add(id, kind, label, position, { props: { nodeId } });
  const asset = (assetId: string, kind: string, position: [number, number], extra: Partial<LayoutItem> = {}) =>
    add(assetId, kind, assetId, position, { assetId, ...extra });
  const pipe = (from: string, to: string, flow: LayoutPipe['flow'] = 'wastewater') =>
    pipes.push({ id: `pipe-${from}-${to}`, from: { itemId: from, port: 'out' }, to: { itemId: to, port: 'in' }, flow });

  const screenH = getKind('vibrating_screen').height;
  const half = (k: string) => getKind(k).footprint[0] / 2;

  // Production & utilities (N01–N17)
  area('bld-production', 'building', 'Production halls', [-30, -3], 'PRODUCTION');
  area('bld-utilities', 'building', 'Utilities (CIP, boiler)', [-30, 3], 'PRODUCTION');
  // W01 raw-water sump with two submersibles inside
  area('W01', 'sump', 'Raw-water collection sump', [-21, 0]);
  asset('P-201A', 'pump_submersible', [-21.9, -0.9]);
  asset('P-201B', 'pump_submersible', [-21.9, 0.9]);
  // W02 vibrating screens, vibrator motors mounted on top
  asset('SC-101A', 'vibrating_screen', [-14.5, -1.5]);
  asset('SC-101B', 'vibrating_screen', [-14.5, 1.5]);
  asset('VM-101A', 'vibrator_motor', [-14.5, -1.5], { props: { elevation: screenH } });
  asset('VM-101B', 'vibrator_motor', [-14.5, 1.5], { props: { elevation: screenH } });
  // W03 – W04
  area('W03', 'separator', 'Oil & grease separator', [-8, 0]);
  area('W04', 'tank', 'Equalization tank', [-0.5, 0]);
  // W05 transfer pump room: motor coaxial on each pump's drive end (+X)
  const px = 6, mx = px + half('pump_end_suction') + half('motor') + 0.08; // coaxial, coupling gap
  asset('P-101A', 'pump_end_suction', [px, -1.4]);
  asset('M-101A', 'motor', [mx, -1.4]);
  asset('P-101B', 'pump_end_suction', [px, 1.4]);
  asset('M-101B', 'motor', [mx, 1.4]);
  // W06 – W08
  area('W06', 'bio_reactor', 'Biological reactor', [16.5, 0]);
  area('W07', 'clarifier', 'Clarifier', [26.5, 0]);
  area('W08', 'discharge', 'Treated effluent discharge', [34, 0]);
  // Spares store
  area('rack', 'spare_rack', 'Spares rack', [-21, 10], 'STORE');
  ['SP-P01', 'SP-P02', 'SP-M01', 'SP-VM01'].forEach((id, i) => {
    const kind = id === 'SP-P01' ? 'pump_end_suction' : id === 'SP-P02' ? 'pump_submersible' : id === 'SP-M01' ? 'motor' : 'vibrator_motor';
    asset(id, kind, [-24 + i * 2, 12.5]);
  });

  // Pipes following the prototype links (L015–L039)
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
  pipe('W07', 'W06', 'sludge');

  return { id: 'default', name: 'Franklin Baker WWTP', items, pipes };
}

export const blankPlant = (name: string): LayoutDoc => ({ id: uid('plant'), name, items: [], pipes: [] });

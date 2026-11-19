/**
 * Asset kind registry. The models agent replaces the placeholder entries with real models.
 * The app only imports `ASSET_KINDS` and `getKind` from here.
 */
import type { AssetKindDef } from './types';
import { PlaceholderBox } from './PlaceholderBox';

const ph = (kind: string, label: string, category: AssetKindDef['category'], fx: number, fz: number, h: number, matches?: string[]): AssetKindDef => ({
  kind, label, category, footprint: [fx, fz], height: h, matchesAssetTypes: matches,
  ports: [
    { id: 'in', position: [-fx / 2, 0.4, 0], direction: [-1, 0, 0] },
    { id: 'out', position: [fx / 2, 0.4, 0], direction: [1, 0, 0] },
  ],
  Component: PlaceholderBox,
});

export const ASSET_KINDS: AssetKindDef[] = [
  ph('pump_end_suction', 'End-suction pump', 'rotating', 1.4, 0.6, 0.8, ['Pump', 'Spare pump']),
  ph('pump_submersible', 'Submersible pump', 'rotating', 0.6, 0.6, 1.0),
  ph('motor', 'Electric motor', 'rotating', 1.0, 0.5, 0.6, ['Motor', 'Spare motor']),
  ph('vibrating_screen', 'Vibrating screen', 'process', 2.4, 1.2, 1.4, ['Screen']),
  ph('vibrator_motor', 'Vibrator motor', 'rotating', 0.5, 0.4, 0.35, ['Vibrator motor']),
  ph('sump', 'Collection sump', 'structure', 4, 4, 1.2),
  ph('tank', 'Equalization tank', 'structure', 5, 5, 4),
  ph('separator', 'Oil & grease separator', 'process', 4, 2, 1.5),
  ph('bio_reactor', 'Biological reactor', 'structure', 7, 5, 3),
  ph('clarifier', 'Clarifier', 'structure', 6, 6, 2.5),
  ph('discharge', 'Discharge outfall', 'utility', 1.5, 1.5, 1),
  ph('building', 'Production building', 'structure', 6, 4, 4),
  ph('spare_rack', 'Spares store', 'utility', 4, 2, 2),
];

const byKind = new Map(ASSET_KINDS.map(k => [k.kind, k]));
export const getKind = (kind: string): AssetKindDef => byKind.get(kind) ?? ASSET_KINDS[0];

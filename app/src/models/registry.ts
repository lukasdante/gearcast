/**
 * Asset kind registry. Geometry facts (footprint, height, ports) come from the Blender builds
 * (models-src/<kind>.py -> models-src/meta/*.json -> kinds/meta.ts), so they always match the GLBs.
 * The app only imports `ASSET_KINDS` and `getKind` from here.
 */
import type { ComponentType } from 'react';
import type { AssetKindDef, AssetModelProps } from './types';
import { META } from './kinds/meta';
import { PumpEndSuction } from './kinds/PumpEndSuction';
import { PumpSubmersible } from './kinds/PumpSubmersible';
import { Motor } from './kinds/Motor';
import { VibratingScreen } from './kinds/VibratingScreen';
import { VibratorMotor } from './kinds/VibratorMotor';
import { Sump } from './kinds/Sump';
import { Tank } from './kinds/Tank';
import { Separator } from './kinds/Separator';
import { BioReactor } from './kinds/BioReactor';
import { Clarifier } from './kinds/Clarifier';
import { Discharge } from './kinds/Discharge';
import { Building } from './kinds/Building';
import { SpareRack } from './kinds/SpareRack';
import { CustomBox } from './kinds/CustomBox';

const def = (kind: string, label: string, category: AssetKindDef['category'],
  Component: ComponentType<AssetModelProps>, matches?: string[]): AssetKindDef => {
  const m = META[kind];
  return { kind, label, category, footprint: m.footprint, height: m.height, ports: m.ports,
    matchesAssetTypes: matches, Component };
};

export const ASSET_KINDS: AssetKindDef[] = [
  def('pump_end_suction', 'End-suction pump', 'rotating', PumpEndSuction, ['Pump', 'Spare pump']),
  def('pump_submersible', 'Submersible pump', 'rotating', PumpSubmersible),
  def('motor', 'Electric motor', 'rotating', Motor, ['Motor', 'Spare motor']),
  def('vibrating_screen', 'Vibrating screen', 'process', VibratingScreen, ['Screen']),
  def('vibrator_motor', 'Vibrator motor', 'rotating', VibratorMotor, ['Vibrator motor']),
  def('sump', 'Collection sump', 'structure', Sump),
  def('tank', 'Equalization tank', 'structure', Tank),
  def('separator', 'Oil & grease separator', 'process', Separator),
  def('bio_reactor', 'Biological reactor', 'structure', BioReactor),
  def('clarifier', 'Clarifier', 'structure', Clarifier),
  def('discharge', 'Discharge outfall', 'utility', Discharge),
  def('building', 'Production building', 'structure', Building),
  def('spare_rack', 'Spares store', 'utility', SpareRack),
  def('custom_box', 'Custom block', 'custom', CustomBox),
];

const byKind = new Map(ASSET_KINDS.map(k => [k.kind, k]));
export const getKind = (kind: string): AssetKindDef => byKind.get(kind) ?? ASSET_KINDS[0];

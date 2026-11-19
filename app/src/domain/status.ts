/**
 * Status logic ported from the GearCast v3.6 prototype
 * (getStatus, getRotationRole, roleForMap, getPairPartner, getSpareRows / Lbackup).
 * Pure functions over a StatusContext so the store can recompute after simulated changes.
 */
import type { VisualState } from '../models/types';
import { AS_OF_DATE, PLANT, OPS, assetById, type Equipment, type EquipmentStatusRow } from '../data';

export interface RoleOverride { duty_asset: string; standby_asset: string; at: string }
export interface StatusContext {
  statusById: Record<string, EquipmentStatusRow>;
  roleOverrides: Record<string, RoleOverride>;
}

export type DerivedStatus =
  | 'In Service' | 'Standby' | 'Under Maintenance' | 'Shut Down' | 'In Storage' | 'Not Available' | 'Stopped' | 'Not recorded';
export type Role = 'DUTY' | 'STBY' | 'STORED' | 'FOLLOWS' | 'NONE';

export const DOWN_STATUSES = ['Shut Down', 'Under Maintenance', 'Not Available'];
export const isDown = (s: string) => DOWN_STATUSES.includes(s);

/** Driver of a driven asset (pump ← motor, screen ← vibrator motor). */
export const DRIVER_OF: Record<string, string> = {
  'P-101A': 'M-101A', 'P-101B': 'M-101B', 'SC-101A': 'VM-101A', 'SC-101B': 'VM-101B',
};
/** Stored spare that can replace an installed asset. */
export const SPARE_FOR: Record<string, string> = {
  'P-101A': 'SP-P01', 'P-101B': 'SP-P01', 'P-201A': 'SP-P02', 'P-201B': 'SP-P02',
  'M-101A': 'SP-M01', 'M-101B': 'SP-M01', 'VM-101A': 'SP-VM01', 'VM-101B': 'SP-VM01',
};

const isSpare = (id: string) => id.startsWith('SP-');

export function getStatus(ctx: StatusContext, id: string): DerivedStatus {
  const asset = assetById.get(id);
  if (asset?.parent_asset) {
    const parent = ctx.statusById[asset.parent_asset]?.current_status ?? 'Not recorded';
    if (isDown(parent)) return 'Stopped';
  }
  const own = (ctx.statusById[id]?.current_status ?? 'Not recorded') as DerivedStatus;
  const driver = DRIVER_OF[id];
  if (driver && isDown(ctx.statusById[driver]?.current_status ?? '')) return 'Not Available';
  return own;
}

export function getPairPartner(asset: Equipment | undefined): Equipment | null {
  if (!asset?.pair_id) return null;
  return PLANT.equipment.find(o => o.asset_id !== asset.asset_id && o.pair_id === asset.pair_id && o.asset_type === asset.asset_type) ?? null;
}

const rotationRows = [...PLANT.dutyRotation].filter(r => r.date <= AS_OF_DATE).sort((a, b) => b.date.localeCompare(a.date));

/** DUTY / STBY from the latest rotation row ≤ as-of, with changeover overrides. Motors follow their pump. */
export function getRotationRole(ctx: StatusContext, id: string): Role {
  const asset = assetById.get(id);
  const ov = asset?.pair_id ? ctx.roleOverrides[asset.pair_id] : undefined;
  if (ov) {
    if (ov.duty_asset === id) return 'DUTY';
    if (ov.standby_asset === id) return 'STBY';
  }
  if (/^M-101[AB]$/.test(id)) return getRotationRole(ctx, `P-101${id.slice(-1)}`);
  if (asset?.parent_asset) return 'FOLLOWS';
  if (isSpare(id) || ctx.statusById[id]?.current_status === 'In Storage') return 'STORED';
  const rec = rotationRows.find(r => r.duty_asset === id || r.standby_asset === id);
  if (rec) return rec.duty_asset === id ? 'DUTY' : 'STBY';
  const partner = getPairPartner(asset);
  if (partner) {
    const pr = rotationRows.find(r => r.duty_asset === partner.asset_id || r.standby_asset === partner.asset_id);
    if (pr) return pr.duty_asset === partner.asset_id ? 'STBY' : 'DUTY';
  }
  return 'NONE';
}

/** Role used for display: children (vibrator motors) take their parent's role. */
export function effectiveRole(ctx: StatusContext, id: string): Role {
  const r = getRotationRole(ctx, id);
  if (r === 'FOLLOWS') {
    const parent = assetById.get(id)?.parent_asset;
    return parent ? getRotationRole(ctx, parent) : 'NONE';
  }
  return r;
}

export type StatusKey = 'running' | 'standby' | 'stopped' | 'maintenance' | 'fault' | 'stored' | 'startNeeded';

export const STATUS_COLORS: Record<StatusKey, string> = {
  running: '#3ccf73',
  standby: '#4b9dff',
  startNeeded: '#f2a93b',
  stopped: '#7d8794',
  maintenance: '#f2b53b',
  fault: '#f05252',
  stored: '#8b95a3',
};

export interface AssetView {
  id: string;
  asset: Equipment | undefined;
  status: DerivedStatus;
  role: Role;
  key: StatusKey;
  visual: VisualState;
  color: string;
  /** Chip text: DUTY / STBY / STORED / STOPPED / NOT AVAILABLE / STBY · START NEEDED */
  chip: string;
}

export function viewAsset(ctx: StatusContext, id: string): AssetView {
  const asset = assetById.get(id);
  const status = getStatus(ctx, id);
  const role = effectiveRole(ctx, id);
  let key: StatusKey;
  let chip: string;
  if (status === 'Shut Down' || status === 'Not Available') { key = 'fault'; chip = status === 'Shut Down' ? 'SHUT DOWN' : 'NOT AVAILABLE'; }
  else if (status === 'Under Maintenance') { key = 'maintenance'; chip = 'MAINTENANCE'; }
  else if (status === 'Stopped') { key = 'stopped'; chip = 'STOPPED'; }
  else if (status === 'In Storage' || isSpare(id)) { key = 'stored'; chip = 'STORED'; }
  else if (role === 'STBY') {
    const partner = getPairPartner(asset);
    const startNeeded = !asset?.parent_asset && partner && isDown(getStatus(ctx, partner.asset_id));
    key = startNeeded ? 'startNeeded' : 'standby';
    chip = startNeeded ? 'STBY · START NEEDED' : 'STBY';
  } else { key = 'running'; chip = role === 'DUTY' ? 'DUTY' : 'IN SERVICE'; }
  const visual: VisualState =
    key === 'running' ? 'running'
      : key === 'fault' ? 'fault'
        : key === 'maintenance' ? 'maintenance'
          : key === 'stored' ? 'stored'
            : 'standby';
  return { id, asset, status, role, key, visual, color: STATUS_COLORS[key], chip };
}

/** Summary buckets for the supervisor's consolidated view. */
export function summarize(ctx: StatusContext) {
  const out = { running: 0, standby: 0, maintenance: 0, fault: 0, stored: 0, stopped: 0 };
  for (const a of PLANT.equipment) {
    const k = viewAsset(ctx, a.asset_id).key;
    if (k === 'startNeeded') out.standby++;
    else out[k]++;
  }
  return out;
}

export interface BackupInfo {
  partner: AssetView | null;
  spareId: string | null;
  spareStatus: string | null;
  spareReadiness: string | null;
  spareLastCheck: string | null;
  backsUp: string[];
}

export function backupInfo(ctx: StatusContext, id: string): BackupInfo {
  const asset = assetById.get(id);
  const partner = getPairPartner(asset);
  const spareId = SPARE_FOR[id] ?? null;
  const sum = spareId ? OPS.spareSummary.find(s => s.asset_id === spareId) : undefined;
  return {
    partner: partner ? viewAsset(ctx, partner.asset_id) : null,
    spareId,
    spareStatus: spareId ? getStatus(ctx, spareId) : null,
    spareReadiness: sum?.readiness_status ?? null,
    spareLastCheck: sum?.last_check_date ?? null,
    backsUp: isSpare(id) ? Object.entries(SPARE_FOR).filter(([, v]) => v === id).map(([k]) => k) : [],
  };
}

/** Prototype changeover rule: duty unit down, partner (installed standby) available → offer switch. */
export function changeoverOffer(ctx: StatusContext, id: string): { pairId: string; down: string; start: string } | null {
  const asset = assetById.get(id);
  if (!asset?.pair_id || asset.parent_asset || /^M-/.test(id)) return null;
  const partner = getPairPartner(asset);
  if (!partner) return null;
  const roleSelf = getRotationRole(ctx, id);
  const [duty, stby] = roleSelf === 'DUTY' ? [asset, partner] : [partner, asset];
  if (getRotationRole(ctx, duty.asset_id) !== 'DUTY') return null;
  if (!isDown(getStatus(ctx, duty.asset_id)) || isDown(getStatus(ctx, stby.asset_id))) return null;
  if (getStatus(ctx, stby.asset_id) !== 'In Service') return null;
  return { pairId: asset.pair_id, down: duty.asset_id, start: stby.asset_id };
}

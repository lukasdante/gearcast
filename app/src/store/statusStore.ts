/**
 * Equipment status store: seeded from plant.json, local simulated overrides persisted to localStorage.
 * Every change appends a statusHistory row (like the prototype's appendStatusChange).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { OPS, PLANT, type EquipmentStatusRow, type StatusHistoryRow } from '../data';
import { getRotationRole, type RoleOverride, type StatusContext } from '../domain/status';
import { nowStamp } from '../domain/assetInfo';

const seedStatus: Record<string, EquipmentStatusRow> = Object.fromEntries(PLANT.equipmentStatus.map(s => [s.asset_id, s]));

interface StatusState {
  overrides: Record<string, EquipmentStatusRow>;
  appended: StatusHistoryRow[];
  roleOverrides: Record<string, RoleOverride>;
  acked: string[];
  setStatus: (id: string, status: string, reason: string) => void;
  switchDuty: (pairId: string, duty: string, standby: string) => void;
  ack: (id: string) => void;
  resetSimulation: () => void;
}

export const useStatusStore = create<StatusState>()(
  persist(
    (set, get) => ({
      overrides: {},
      appended: [],
      roleOverrides: {},
      acked: [],
      setStatus: (id, status, reason) => {
        const cur = get().overrides[id] ?? seedStatus[id];
        if (!cur || cur.current_status === status) return;
        const all = [...OPS.statusHistory, ...get().appended];
        const seq = Math.max(0, ...all.map(h => Number(h.history_id.replace(/\D/g, '')) || 0)) + 1;
        const at = nowStamp();
        const row: StatusHistoryRow = {
          history_id: 'SH-' + String(seq).padStart(4, '0'), asset_id: id,
          previous_status: cur.current_status, new_status: status, effective_at: at, ended_at: null,
          reason, source_type: 'Simulation', source_id: null, incident_report_id: null,
          recorded_by: 'Head of Operations (simulation)', authorized_by: 'Not recorded', data_mode: 'Simulated',
        };
        set(s => ({
          appended: [...s.appended, row],
          overrides: { ...s.overrides, [id]: { ...cur, current_status: status, status_since: at, last_history_id: row.history_id, status_source: 'Simulated' } },
          acked: s.acked.filter(a => a !== id),
        }));
      },
      switchDuty: (pairId, duty, standby) =>
        set(s => ({ roleOverrides: { ...s.roleOverrides, [pairId]: { duty_asset: duty, standby_asset: standby, at: nowStamp() } } })),
      ack: id => set(s => ({ acked: s.acked.includes(id) ? s.acked : [...s.acked, id] })),
      resetSimulation: () => set({ overrides: {}, appended: [], roleOverrides: {}, acked: [] }),
    }),
    { name: 'gearcast.status.v1' },
  ),
);

/** Stable StatusContext derived from the store (memoised on the override objects). */
let lastKey: unknown[] = [];
let lastCtx: StatusContext | null = null;
export function useStatusCtx(): StatusContext {
  const overrides = useStatusStore(s => s.overrides);
  const roleOverrides = useStatusStore(s => s.roleOverrides);
  if (!lastCtx || lastKey[0] !== overrides || lastKey[1] !== roleOverrides) {
    lastKey = [overrides, roleOverrides];
    lastCtx = { statusById: { ...seedStatus, ...overrides }, roleOverrides };
  }
  return lastCtx;
}

export const dutyOfPair = (ctx: StatusContext, pairId: string) =>
  PLANT.equipment.find(a => a.pair_id === pairId && !a.parent_asset && !/^M-/.test(a.asset_id) && getRotationRole(ctx, a.asset_id) === 'DUTY')?.asset_id;

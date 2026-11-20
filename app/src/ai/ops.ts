/**
 * Caster's operation registry — the app's write capabilities, run when Caster calls an operation tool
 * (backend/src/gearcast_backend/ops.py declares the same names and schemas, MCP-style).
 */
import { OPS, PLANT } from '../data';
import { del, postJSON, simPayload } from '../api/client';
import { pushAssignments } from '../api/assignments';
import { storeReportPdf } from '../api/incidentDocs';
import { usePlantStore } from '../store/plantStore';
import { useStatusStore } from '../store/statusStore';
import { useIntent } from '../store/intentStore';
import { navigate, type Route } from '../store/route';
import { openAsset } from '../shell/TopBar';
import { useChecks } from '../pages/SpareReadiness';

type Args = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export interface OpDef { label: (a: Args) => string; run: (a: Args) => Promise<string> | string }

const AKEY = 'gearcast.pm.assign.v1';
const XKEY = 'gearcast.spares.extra.v1';
const read = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) || '') as T; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

const asset = (id: string) => {
  const a = PLANT.equipment.find(x => x.asset_id === String(id ?? '').toUpperCase());
  if (!a) throw new Error(`Unknown asset ${id}`);
  return a;
};
const plantByName = (name: string) => {
  const s = usePlantStore.getState(), n = String(name ?? '').trim().toLowerCase();
  const id = s.order.find(i => s.plants[i]?.name.toLowerCase() === n) ?? s.order.find(i => s.plants[i]?.name.toLowerCase().includes(n));
  if (!id) throw new Error(`No plant named "${name}"`);
  return { id, name: s.plants[id].name };
};
const seedStatus = (id: string) => PLANT.equipmentStatus.find(s => s.asset_id === id)?.current_status ?? 'In Service';

export const OP_REGISTRY: Record<string, OpDef> = {
  open_page: {
    label: a => `Open ${a.page}${a.asset_id ? ` · ${a.asset_id}` : ''}`,
    run: a => {
      if (a.asset_id && a.page === 'overview') openAsset(asset(a.asset_id).asset_id);
      else { if (a.asset_id && a.page === 'assets') useIntent.getState().setAsset(asset(a.asset_id).asset_id); navigate(a.page as Route); }
      return `Opened ${a.page}`;
    },
  },
  create_plant: {
    label: a => `Create plant "${a.name}"`,
    run: a => { usePlantStore.getState().createPlant(String(a.name).trim()); navigate('overview'); return `Created and opened "${a.name}"`; },
  },
  rename_plant: {
    label: a => `Rename "${a.plant}" → "${a.new_name}"`,
    run: a => { const p = plantByName(a.plant); usePlantStore.getState().renamePlant(p.id, String(a.new_name).trim()); return `Renamed to "${a.new_name}"`; },
  },
  switch_plant: {
    label: a => `Switch to plant "${a.plant}"`,
    run: a => { const p = plantByName(a.plant); usePlantStore.getState().setActive(p.id); navigate('overview'); return `Switched to "${p.name}"`; },
  },
  delete_plant: {
    label: a => `Delete plant "${a.plant}"`,
    run: a => {
      const p = plantByName(a.plant), s = usePlantStore.getState();
      if (s.order.length <= 1) throw new Error('Cannot delete the only plant');
      s.deletePlant(p.id); return `Deleted "${p.name}"`;
    },
  },
  simulate_fault: {
    label: a => `Simulate fault on ${a.asset_id}`,
    run: a => { const x = asset(a.asset_id); useStatusStore.getState().setStatus(x.asset_id, 'Shut Down', a.reason ? `Simulated fault (Caster): ${a.reason}` : 'Simulated fault (Caster)'); return `${x.asset_id} set to Shut Down (simulated)`; },
  },
  clear_fault: {
    label: a => `Clear simulated status on ${a.asset_id}`,
    run: a => { const x = asset(a.asset_id); useStatusStore.getState().setStatus(x.asset_id, seedStatus(x.asset_id), 'Simulated fault cleared (Caster)'); return `${x.asset_id} back to ${seedStatus(x.asset_id)}`; },
  },
  reset_simulation: { label: () => 'Reset all simulated statuses', run: () => { useStatusStore.getState().resetSimulation(); return 'Simulation reset'; } },
  switch_duty: {
    label: a => `Make ${a.asset_id} the duty unit`,
    run: a => {
      const x = asset(a.asset_id);
      const partner = PLANT.equipment.find(o => o.pair_id === x.pair_id && o.asset_id !== x.asset_id && o.asset_type === x.asset_type);
      if (!x.pair_id || !partner) throw new Error(`${x.asset_id} has no duty/standby partner`);
      useStatusStore.getState().switchDuty(x.pair_id, x.asset_id, partner.asset_id);
      return `${x.asset_id} is duty, ${partner.asset_id} standby`;
    },
  },
  assign_pm: {
    label: a => `Assign ${a.task_id}${a.asset_id ? ` (${a.asset_id})` : ''} → ${a.assignee || 'unassigned'}`,
    run: a => {
      const rows = OPS.pmStatus.filter(r => r.task_id === String(a.task_id).toUpperCase()
        && (!a.asset_id || r.asset_id === String(a.asset_id).toUpperCase()
          || (r.asset_id.includes('/') && r.asset_id.startsWith(String(a.asset_id).toUpperCase().slice(0, -1)))));
      if (!rows.length) throw new Error(`No PM task ${a.task_id}${a.asset_id ? ` for ${a.asset_id}` : ''}`);
      const m = read<Record<string, string>>(AKEY, {});
      for (const r of rows) { if (a.assignee) m[r.status_id] = String(a.assignee).toUpperCase(); else delete m[r.status_id]; }
      write(AKEY, m); pushAssignments(m); window.dispatchEvent(new Event('gearcast:pm-assign'));
      return `${rows.length} task row(s) ${a.assignee ? `assigned to ${String(a.assignee).toUpperCase()}` : 'unassigned'}`;
    },
  },
  add_spare_part: {
    label: a => `Add spare part "${a.part_name}"`,
    run: a => {
      const extra = read<{ part_id: string }[]>(XKEY, []);
      const all = [...OPS.spareInventory, ...extra];
      const id = `SPP-${String(Math.max(0, ...all.map(p => Number(p.part_id.replace(/\D/g, '')) || 0)) + 1).padStart(3, '0')}`;
      extra.push({
        part_id: id, part_name: a.part_name, part_number: null, category: a.category ?? 'Other', unit: a.unit ?? 'pc',
        fits_assets: (a.fits_assets ?? []).join('; '), qty_on_hand: Number(a.qty_on_hand), min_qty: Number(a.min_qty), max_qty: null,
        reorder_point: null, lead_time_days: a.lead_time_days ?? null, unit_cost_php: a.unit_cost_php ?? null, critical: !!a.critical,
        storage_location: a.storage_location ?? null, below_min: Number(a.qty_on_hand) < Number(a.min_qty),
      } as never);
      write(XKEY, extra); window.dispatchEvent(new Event('gearcast:spares'));
      return `Added ${id} ${a.part_name}`;
    },
  },
  mark_spare_checked: {
    label: a => `Mark ${a.id} checked today`,
    run: a => { const today = new Date(); const d = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`; useChecks.getState().set(String(a.id).toUpperCase(), { last: d }); return `${a.id} checked today`; },
  },
  set_check_frequency: {
    label: a => `Check ${a.id} every ${a.days} days`,
    run: a => { useChecks.getState().set(String(a.id).toUpperCase(), { freq: Math.max(1, Number(a.days)) }); return `${a.id}: every ${a.days} days`; },
  },
  start_troubleshoot: {
    label: a => `Troubleshoot "${a.query}"${a.asset_id ? ` on ${a.asset_id}` : ''}`,
    run: a => { useIntent.getState().setTroubleshoot(a.query, a.asset_id ?? null); navigate('troubleshoot'); return 'Troubleshooting started'; },
  },
  create_incident: {
    label: a => `Submit incident report for ${a.asset_id}${a.shut_down ? ' and shut it down' : ''}`,
    run: async a => {
      const x = asset(a.asset_id);
      const now = new Date(); const pad = (n: number) => String(n).padStart(2, '0');
      const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const draft = await postJSON<Record<string, unknown>>('/api/incidents/draft', {
        asset_id: x.asset_id, failure_at: stamp, reported_by: 'Head of Operations', detected_by: a.detected_by ?? '', operating_condition: '',
        observed: a.observed, actions_taken: a.actions_taken ?? '', downtime_h: a.downtime_h ?? null, procedure_used: a.procedure_used ?? '',
        parts_used: '', safety_injury: 'None', shut_down: !!a.shut_down, sim: simPayload(),
      });
      const res = await postJSON<{ report_id: string; status_change?: { asset_id: string; new_status: string; reason: string } | null }>('/api/incidents', draft);
      if (res.status_change) useStatusStore.getState().setStatus(res.status_change.asset_id, res.status_change.new_status, res.status_change.reason);
      await storeReportPdf(res.report_id).catch(() => { /* rendered on first download instead */ });
      window.dispatchEvent(new Event('gearcast:incidents'));
      return `Submitted ${res.report_id}${res.status_change ? ` · ${x.asset_id} shut down` : ''}`;
    },
  },
  delete_incident: {
    label: a => `Delete incident report ${a.report_id}`,
    run: async a => { await del(`/api/incidents/${encodeURIComponent(a.report_id)}`); window.dispatchEvent(new Event('gearcast:incidents')); return `Deleted ${a.report_id}`; },
  },
};

/** Snapshot of browser-held state for Caster's get_app_state tool. */
export function appState() {
  const p = usePlantStore.getState();
  return {
    plants: p.order.map(id => ({ name: p.plants[id]?.name, active: id === p.activeId, items: p.plants[id]?.items.length })),
    pm_assignments: Object.entries(read<Record<string, string>>(AKEY, {})).map(([sid, who]) => {
      const r = OPS.pmStatus.find(x => x.status_id === sid); return { task_id: r?.task_id, asset_id: r?.asset_id, assignee: who };
    }),
    spares_added_in_app: read<{ part_id: string; part_name: string }[]>(XKEY, []).map(x => ({ part_id: x.part_id, part_name: x.part_name })),
    readiness_checks: useChecks.getState().m,
  };
}

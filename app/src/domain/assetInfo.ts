/** Read-only lookups for the Asset Inspector (port of renderAssetPanelImpl helpers). */
import { NOW_DATE, OPS, assetById, type StatusHistoryRow } from '../data';

const FIG_FOR_PREFIX: [RegExp, string][] = [
  [/^(P-101|SP-P01)/, 'FIG-01'],
  [/^(P-201|SP-P02)/, 'FIG-02'],
  [/^(M-|SP-M01)/, 'FIG-03'],
  [/^SC-/, 'FIG-04'],
  [/^(VM-|SP-VM01)/, 'FIG-05'],
];

export function figureFor(id: string): { src: string; title: string } | null {
  const fig = FIG_FOR_PREFIX.find(([re]) => re.test(id))?.[1];
  if (!fig) return null;
  const row = OPS.procedureFigures.find(f => f.figure_id === fig);
  if (!row) return null;
  return { src: `/figures/${row.file_name}`, title: `${fig} · ${row.title}` };
}

/** pmStatus rows for an asset; expands "P-101A/B" style group targets. */
export function pmFor(id: string) {
  const matches = (target: string) => {
    if (target === id) return true;
    const m = target.match(/^(.*?)([A-Z])\/([A-Z])$/);
    return !!m && [m[1] + m[2], m[1] + m[3]].includes(id);
  };
  return OPS.pmStatus
    .filter(r => matches(r.asset_id))
    .sort((a, b) => (a.days_until_due ?? 9999) - (b.days_until_due ?? 9999));
}

export function failuresFor(id: string) {
  const install = assetById.get(id)?.install_date ?? '0000';
  return OPS.failures
    .filter(f => f.asset_id === id && f.failure_at.slice(0, 10) >= install.slice(0, 10))
    .sort((a, b) => b.failure_at.localeCompare(a.failure_at));
}

export function workOrdersFor(id: string) {
  return OPS.workOrders.filter(w => w.asset_id === id).sort((a, b) => b.reported_at.localeCompare(a.reported_at));
}

export function latestHistory(id: string, appended: StatusHistoryRow[]): StatusHistoryRow | null {
  return [...OPS.statusHistory, ...appended]
    .filter(h => h.asset_id === id)
    .sort((a, b) => b.effective_at.localeCompare(a.effective_at) || b.history_id.localeCompare(a.history_id))[0] ?? null;
}

/** Daily check readings (running only) for the last `days` days up to the as-of date. */
export function dailyChecksFor(id: string, days = 30) {
  const end = new Date(NOW_DATE + 'T12:00:00').getTime();
  const cut = end - days * 86400000;
  return OPS.dailyChecks
    .filter(c => c.asset_id === id && c.running && new Date(c.date + 'T12:00:00').getTime() >= cut)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** ISO 10816 zone for vibration velocity (mm/s), as in the prototype (2.8 / 4.5 / 7.1). */
export const vibZone = (v: number | null) =>
  v == null ? 'na' : v < 2.8 ? 'good' : v < 4.5 ? 'ok' : v < 7.1 ? 'warn' : 'bad';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDate(s: string | null | undefined, withTime = false) {
  if (!s) return '—';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return s;
  const d = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  return withTime && m[4] ? `${d} ${m[4]}:${m[5]}` : d;
}

export function nowStamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------------------------------------------------------------- extended inspector lookups

const dayMs = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
/** Milliseconds for the start of the `days` window ending today. */
export const windowStart = (days: number) => dayMs(NOW_DATE) - days * 86400000;
export const dateMs = dayMs;

/** Manual-round readings (flow, discharge pressure, motor current) within the last `days`. */
export function roundsFor(id: string, days: number) {
  const cut = windowStart(days);
  return OPS.manualRounds.filter(r => r.asset_id === id && dayMs(r.date) >= cut).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}
/** All daily checks (running or not) within the last `days`. */
export function checksFor(id: string, days: number) {
  const cut = windowStart(days);
  return OPS.dailyChecks.filter(c => c.asset_id === id && dayMs(c.date) >= cut).sort((a, b) => a.date.localeCompare(b.date));
}

/** Status history rows (recorded + simulated), newest first. */
export function historyFor(id: string, appended: StatusHistoryRow[]) {
  return [...OPS.statusHistory, ...appended].filter(h => h.asset_id === id)
    .sort((a, b) => b.effective_at.localeCompare(a.effective_at) || b.history_id.localeCompare(a.history_id));
}

/** Expand "P-101A/B; SC-101A/B" style target lists. */
const expandTargets = (s: string | null | undefined) => (s ?? '').split(';').map(x => x.trim()).filter(Boolean).flatMap(t => {
  const m = t.match(/^(.*?)([A-Z])\/([A-Z])$/);
  return m ? [m[1] + m[2], m[1] + m[3]] : [t];
});

/** Procedures linked to an asset through its PM tasks (prototype procIdsForAsset) plus procedures naming its equipment. */
export function proceduresFor(id: string) {
  const ids = OPS.pmTasks.filter(t => expandTargets(t.assets).includes(id))
    .flatMap(t => (t.procedure_ids ?? '').split(';').map(x => x.trim())).filter(Boolean);
  const byEquip = OPS.procedures.filter(p => expandTargets(p.equipment?.replace(/,/g, ';')).includes(id)).map(p => p.procedure_id);
  const all = [...new Set([...ids, ...byEquip])];
  return all.map(pid => OPS.procedures.find(p => p.procedure_id === pid)).filter((p): p is NonNullable<typeof p> => !!p);
}

/** Spare parts that fit this asset, with stock levels. */
export function partsFor(id: string) {
  return OPS.spareInventory.filter(p => p.fits_assets.split(';').map(x => x.trim()).includes(id))
    .sort((a, b) => Number(b.below_min) - Number(a.below_min) || Number(b.critical) - Number(a.critical) || a.part_id.localeCompare(b.part_id));
}

export function incidentsFor(id: string) {
  return OPS.incidentReports.filter(r => r.asset_id === id).sort((a, b) => b.incident_date.localeCompare(a.incident_date));
}

/** Failures since install, MTBF (days) over the same window. */
export function reliabilityFor(id: string) {
  const fails = failuresFor(id);
  const install = assetById.get(id)?.install_date;
  const ageDays = install ? Math.max(1, Math.round((dayMs(NOW_DATE) - dayMs(install)) / 86400000)) : null;
  return { count: fails.length, ageDays, mtbfDays: ageDays && fails.length ? Math.round(ageDays / fails.length) : null, last: fails[0] ?? null };
}

/** Kind used for the 3D snapshot when the asset isn't placed on the current layout. */
export function kindForAsset(id: string) {
  if (/^(P-101|SP-P01)/.test(id)) return 'pump_end_suction';
  if (/^(P-201|SP-P02)/.test(id)) return 'pump_submersible';
  if (/^(M-|SP-M01)/.test(id)) return 'motor';
  if (/^SC-/.test(id)) return 'vibrating_screen';
  if (/^(VM-|SP-VM01)/.test(id)) return 'vibrator_motor';
  return 'custom_box';
}

/** Read-only lookups for the Asset Inspector (port of renderAssetPanelImpl helpers). */
import { AS_OF_DATE, OPS, assetById, type StatusHistoryRow } from '../data';

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
  const end = new Date(AS_OF_DATE + 'T12:00:00').getTime();
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

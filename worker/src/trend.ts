/** Trend series for the incident report ("3. Readings before the failure"): the condition readings that lead up to
 *  the failure over a selectable window (1 week … 1 year, default 6 weeks), as chart specs (drawn by src/doc/chart.ts in the app, the PDF and the DOCX). */
import { CLOCK, D, DRIVER_OF } from './data';
import { DAY, parseDt } from './time';
import type { TrendSpec, TrendSeries } from './doc/chart';

const WINDOW_D = 42;
/** Windows the user can pick (days before the failure). */
export const TREND_WINDOWS: { days: number; label: string }[] = [
  { days: 7, label: '1 week' }, { days: 14, label: '2 weeks' }, { days: 30, label: '1 month' }, { days: 42, label: '6 weeks' },
  { days: 182, label: '6 months' }, { days: 365, label: '1 year' },
];
export const trendDays = (v: unknown) => { const n = Math.round(Number(v)); return TREND_WINDOWS.some(w => w.days === n) ? n : WINDOW_D; };
const windowLabel = (days: number) => TREND_WINDOWS.find(w => w.days === days)?.label ?? `${days} days`;
/** Bin width (days) so long windows stay readable: daily up to 2 months, then 3-day, then weekly. */
const binOf = (days: number) => (days <= 62 ? 1 : days <= 190 ? 3 : 7);
const DC: Record<string, number> = { vib_de: 2, vib_nde: 3, temp_de: 4, temp_nde: 5 };
const MR: Record<string, number> = { flow: 1, current: 3 };
const C = { de: '#1f77b4', nde: '#8e5bb5', flow: '#1a8f6a', current: '#c0581b' };

/** Binned series, x = days relative to the failure (−days … 0). dc rows count only while the unit was running.
 *  Daily bins keep the last reading (or the mean for meter rounds); wider bins always average. */
function seriesOf(rows: any[][], col: number, end: number, dc: boolean, mean: boolean, days = WINDOW_D): [number, number][] {
  const sh = D.shiftMin, start = end - days * DAY, bin = binOf(days);
  if (bin > 1) mean = true;
  const bins = new Map<number, { s: number; n: number; last: number }>();
  for (const r of rows) {
    const t = r[0] + sh, v = r[col];
    if (t < start || t > end || v === null || v === undefined || (dc && !r[1])) continue;
    const d = Math.floor((t - end) / DAY / bin) * bin;
    const b = bins.get(d) ?? { s: 0, n: 0, last: v };
    b.s += v; b.n++; b.last = v; bins.set(d, b);
  }
  return [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([d, b]) => [d, +(mean ? b.s / b.n : b.last).toFixed(2)]);
}

const r1 = (v: number) => (Math.round(v * 10) / 10).toString();
const dateAt = (end: number, d: number) => D.dateOfMin(end + d * DAY);

function summarize(spec: TrendSpec, end: number, days = WINDOW_D): string {
  const s = spec.series.find(x => x.pts.length) as TrendSeries | undefined;
  if (!s) return `No readings in the ${windowLabel(days)} before the failure.`;
  const first = s.pts[0][1], last = s.pts[s.pts.length - 1][1];
  const dir = last > first * 1.1 ? 'rose' : last < first * 0.9 ? 'fell' : 'stayed steady';
  let txt = `${s.name} ${dir} from ${r1(first)} to ${r1(last)} ${spec.unit}`;
  const lim = [...spec.limits].sort((a, b) => a.v - b.v);
  const crossed = lim.map(l => ({ l, day: Math.min(...spec.series.map(x => x.pts.find(p => p[1] >= l.v)?.[0] ?? Infinity)) })).filter(c => c.day !== Infinity);
  if (crossed.length) txt += '; crossed ' + crossed.map(c => `${c.l.label} ${c.l.v} on ${dateAt(end, c.day)}`).join(', ');
  else if (lim.length) txt += `; stayed below ${lim[0].label} (${lim[0].v})`;
  return txt + '.';
}

/** Up to two charts for an asset: a daily-check chart (vibration, else bearing temperature) and a meter chart. */
export function trendsFor(aid: string, failureAt: string | null | undefined, days = WINDOW_D): TrendSpec[] {
  // screens have no sensors of their own: chart the drive motor (VM-101A/B) and say so in the titles
  const drv = DRIVER_OF[aid];
  const own = D.dcRows(aid).length || D.mrRows(aid).length;
  const src = !own && drv ? drv : aid;
  const specs = trendsOf(src, failureAt, trendDays(days));
  if (src !== aid) for (const s of specs) s.title = `${src} drive motor – ${s.title.charAt(0).toLowerCase()}${s.title.slice(1)}`;
  return specs;
}

function ticksFor(end: number, days: number) {
  const step = days === 42 ? 7 : days / 6;
  return Array.from({ length: 7 }, (_, i) => Math.round(-days + i * step)).map(d => ({ x: d, label: days > 62 ? dateAt(end, d).slice(2, 7) : dateAt(end, d).slice(5) }));
}

function trendsOf(aid: string, failureAt: string | null | undefined, days: number): TrendSpec[] {
  const end = Math.min(parseDt(failureAt ?? '') ?? parseDt(CLOCK.asOf)!, parseDt(CLOCK.asOf)!);
  const dc = D.dcRows(aid), mr = D.mrRows(aid);
  const base = { x0: -days, x1: 0, ticks: ticksFor(end, days), end_label: `Failure ${dateAt(end, 0).slice(5)}`, start_date: dateAt(end, -days), end_date: dateAt(end, 0),
    window_days: days, window_label: windowLabel(days) };
  const series = (rows: any[][], col: number, e: number, isDc: boolean, mean: boolean) => seriesOf(rows, col, e, isDc, mean, days);
  const out: TrendSpec[] = [];

  const de = series(dc, DC.vib_de, end, true, false), nde = series(dc, DC.vib_nde, end, true, false);
  if (de.length || nde.length) {
    out.push({ ...base, title: 'Vibration (daily check)', unit: 'mm/s', y_min: 0,
      series: [{ name: 'Vib DE', color: C.de, pts: de }, { name: 'Vib NDE', color: C.nde, pts: nde }],
      limits: [{ v: 2.8, label: 'Alert', color: '#b8860b' }, { v: 4.5, label: 'Alarm', color: '#d2691e' }, { v: 7.1, label: 'Trip', color: '#c0392b' }],
      bands: [{ from: 0, to: 2.8, color: '#e3f1e6' }, { from: 2.8, to: 4.5, color: '#fbf1cf' }, { from: 4.5, to: 7.1, color: '#f8e2d2' }, { from: 7.1, to: 99, color: '#f4d6d6' }],
      summary: '' });
  } else {
    const tde = series(dc, DC.temp_de, end, true, false), tnde = series(dc, DC.temp_nde, end, true, false);
    if (tde.length || tnde.length) out.push({ ...base, title: 'Bearing temperature (daily check)', unit: '°C', y_min: null,
      series: [{ name: 'Temp DE', color: C.de, pts: tde }, { name: 'Temp NDE', color: C.nde, pts: tnde }],
      limits: [{ v: 80, label: 'Alarm', color: '#d2691e' }, { v: 90, label: 'Stop', color: '#c0392b' }], bands: [], summary: '' });
  }
  const flow = series(mr, MR.flow, end, false, true);
  const cur = series(mr, MR.current, end, false, true);
  if (flow.length) out.push({ ...base, title: 'Flow (daily mean of meter rounds)', unit: 'm³/h', y_min: 0,
    series: [{ name: 'Flow', color: C.flow, pts: flow }], limits: [], bands: [], summary: '' });
  if (cur.length && out.length < 2) out.push({ ...base, title: 'Motor current (daily mean of meter rounds)', unit: 'A', y_min: 0,
    series: [{ name: 'Current', color: C.current, pts: cur }],
    limits: /^M-101/.test(aid) ? [{ v: 13.4, label: '105% FLC', color: '#c0392b' }] : [], bands: [], summary: '' });
  for (const s of out.slice(0, 2)) s.summary = summarize(s, end, days);
  return out.slice(0, 2);
}

/** Trend charts for the incident report ("3. Readings before the failure"): the condition readings that lead up to the
 *  failure over a selectable window (1 week … 1 year, or from a custom start date; default 6 weeks) for the indicators
 *  the user picks, as chart specs (drawn by src/doc/chart.ts in the app, the PDF and the DOCX).
 *  Long windows are aggregated (3-day or weekly mean, with the min–max spread shaded) so they stay readable. */
import { CLOCK, D, DRIVER_OF } from './data';
import { DAY, parseDt } from './time';
import type { TrendLimit, TrendSpec, TrendSeries } from './doc/chart';

const WINDOW_D = 42, MAX_D = 730;
/** Windows the user can pick (days before the failure). */
export const TREND_WINDOWS: { days: number; label: string }[] = [
  { days: 7, label: '1 week' }, { days: 14, label: '2 weeks' }, { days: 30, label: '1 month' }, { days: 42, label: '6 weeks' },
  { days: 182, label: '6 months' }, { days: 365, label: '1 year' },
];
/** Any whole number of days 1…730 (the readings cover two years); anything else → the 6-week default. */
export const trendDays = (v: unknown) => { const n = Math.round(Number(v)); return n >= 1 && n <= MAX_D ? n : WINDOW_D; };
const windowLabel = (days: number) => TREND_WINDOWS.find(w => w.days === days)?.label ?? `${days} days`;

// ------------------------------------------------------------------ indicators (Daily_Detailed_Checks + Manual_Rounds)
type Group = 'vib' | 'temp' | 'seal' | 'flow' | 'pressure' | 'current';
interface Ind { key: string; label: string; tbl: 'dc' | 'mr'; col: number; group: Group; color: string }
export const TREND_INDICATORS: Ind[] = [
  { key: 'vib_de', label: 'Vib DE', tbl: 'dc', col: 2, group: 'vib', color: '#1f77b4' },
  { key: 'vib_nde', label: 'Vib NDE', tbl: 'dc', col: 3, group: 'vib', color: '#8e5bb5' },
  { key: 'temp_de', label: 'Temp DE', tbl: 'dc', col: 4, group: 'temp', color: '#d0612a' },
  { key: 'temp_nde', label: 'Temp NDE', tbl: 'dc', col: 5, group: 'temp', color: '#a0522d' },
  { key: 'seal', label: 'Seal reservoir', tbl: 'dc', col: 6, group: 'seal', color: '#2a7fa0' },
  { key: 'flow', label: 'Flow', tbl: 'mr', col: 1, group: 'flow', color: '#1a8f6a' },
  { key: 'pressure', label: 'Discharge pressure', tbl: 'mr', col: 2, group: 'pressure', color: '#5a6fb5' },
  { key: 'current', label: 'Current', tbl: 'mr', col: 3, group: 'current', color: '#c0581b' },
];
const GROUP_ORDER: Group[] = ['vib', 'temp', 'seal', 'flow', 'pressure', 'current'];
const IND_LONG: Record<string, string> = {
  vib_de: 'Vibration DE (mm/s)', vib_nde: 'Vibration NDE (mm/s)', temp_de: 'Bearing temp DE (°C)', temp_nde: 'Bearing temp NDE (°C)',
  seal: 'Seal reservoir level (%)', flow: 'Flow (m³/h)', pressure: 'Discharge pressure (bar)', current: 'Motor current (A)',
};

/** The asset whose readings are charted: screens have no sensors of their own, so their drive motor (VM-101A/B). */
function sourceOf(aid: string) {
  const drv = DRIVER_OF[aid];
  const own = D.dcRows(aid).length || D.mrRows(aid).length;
  return !own && drv ? drv : aid;
}
const hasData = (aid: string, i: Ind) => {
  const rows = i.tbl === 'dc' ? D.dcRows(aid) : D.mrRows(aid);
  return rows.some(r => (i.tbl === 'mr' || r[1]) && r[i.col] !== null && r[i.col] !== undefined);
};
/** Indicators recorded for an asset (for the picker). */
export function trendIndicators(aid: string): { key: string; label: string; available: boolean; source: string }[] {
  const src = sourceOf(aid);
  return TREND_INDICATORS.map(i => ({ key: i.key, label: IND_LONG[i.key], available: hasData(src, i), source: src }));
}
/** Default selection (what the report showed before the picker existed): vibration, else bearing temperature; flow;
 *  motor current when that leaves room. */
function defaultIndicators(src: string): string[] {
  const av = new Set(TREND_INDICATORS.filter(i => hasData(src, i)).map(i => i.key));
  const out: string[] = [];
  const vib = ['vib_de', 'vib_nde'].filter(k => av.has(k)), temp = ['temp_de', 'temp_nde'].filter(k => av.has(k));
  if (vib.length) out.push(...vib); else out.push(...temp);
  if (av.has('flow')) out.push('flow');
  const charts = (vib.length || temp.length ? 1 : 0) + (av.has('flow') ? 1 : 0);
  if (av.has('current') && charts < 2) out.push('current');
  return out;
}

// ------------------------------------------------------------------ options
/** The chosen range + indicators, stored with the report (`trend`) and used for its charts. */
export interface TrendOpts { days: number; from: string | null; indicators: string[] | null }
/** Normalise user input: preset or custom days, or a custom start date (YYYY-MM-DD, wins over days); indicator keys. */
export function trendOpts(v: any): TrendOpts {
  const o = v && typeof v === 'object' ? v : { days: v };
  const from = typeof o.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.from) && parseDt(o.from) !== null ? o.from : null;
  const raw = Array.isArray(o.indicators) ? o.indicators : typeof o.indicators === 'string' && o.indicators ? o.indicators.split(',') : null;
  const keys = raw ? TREND_INDICATORS.map(i => i.key).filter(k => raw.includes(k)) : null;
  return { days: trendDays(o.days), from, indicators: keys && keys.length ? keys : null };
}
/** Options with the default indicator selection filled in (so the app shows, and the report stores, a concrete choice). */
export const withDefaults = (aid: string, o: TrendOpts): TrendOpts => ({ ...o, indicators: o.indicators ?? defaultIndicators(sourceOf(aid)) });
/** Clock frame of a stored report: readings are shifted to "today" on every request, so a report submitted on another
 *  day is re-charted with the shift that applied when it was made. */
export interface TrendFrame { shiftMin: number; asOfMin: number }

// ------------------------------------------------------------------ series
/** Bin width (days) so long windows stay readable: daily up to 2 months, then 3-day, then weekly. */
const binOf = (days: number) => (days <= 62 ? 1 : days <= 190 ? 3 : 7);
const BIN_NAME: Record<number, string> = { 1: 'daily', 3: '3-day', 7: 'weekly' };

/** Binned series, x = days relative to the failure (bin centres, −days … 0). dc rows count only while the unit ran.
 *  Each bin: mean (the single reading for a once-a-day check) and min–max of the readings in it. */
function seriesOf(rows: any[][], col: number, end: number, start: number, dc: boolean, bin: number, sh: number) {
  const bins = new Map<number, { s: number; n: number; lo: number; hi: number }>();
  const raw: [number, number][] = [];
  for (const r of rows) {
    const t = r[0] + sh, v = r[col];
    if (t <= start || t > end || v === null || v === undefined || (dc && !r[1])) continue;
    raw.push([t, v]);
    const k = Math.floor((end - t) / DAY / bin);
    const b = bins.get(k);
    if (b) { b.s += v; b.n++; b.lo = Math.min(b.lo, v); b.hi = Math.max(b.hi, v); } else bins.set(k, { s: v, n: 1, lo: v, hi: v });
  }
  const ks = [...bins.keys()].sort((a, b) => b - a);
  const x = (k: number) => +(-(k + 0.5) * bin).toFixed(2);
  const pts = ks.map(k => [x(k), +(bins.get(k)!.s / bins.get(k)!.n).toFixed(2)] as [number, number]);
  const band = ks.map(k => [x(k), +bins.get(k)!.lo.toFixed(2), +bins.get(k)!.hi.toFixed(2)] as [number, number, number]);
  return { pts, band: band.some(b => b[2] > b[1]) ? band : undefined, raw };
}

const r1 = (v: number) => (Math.round(v * 10) / 10).toString();
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateAt = (end: number, d: number) => D.dateOfMin(end + d * DAY);
const dayMon = (iso: string) => `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}`;

/** Per-chart text: direction (first → last point), the actual peak reading and the first reading above each limit. */
function summarize(spec: TrendSpec, raws: [number, number][][], days: number): string {
  const ss = spec.series.map((s, i) => ({ s, raw: raws[i] })).filter(x => x.s.pts.length);
  if (!ss.length) return `No readings in the ${windowLabel(days)} before the failure.`;
  const day = (t: number) => D.dateOfMin(t);
  const parts = ss.map(({ s, raw }) => {
    const first = s.pts[0][1], last = s.pts[s.pts.length - 1][1];
    const dir = last > first * 1.1 ? 'rose' : last < first * 0.9 ? 'fell' : 'steady';
    const hi = raw.reduce((a, b) => (b[1] > a[1] ? b : a));
    return `${s.name} ${dir} ${r1(first)} → ${r1(last)} ${spec.unit} (peak ${r1(hi[1])} on ${day(hi[0])})`;
  });
  let txt = parts.join('; ');
  const lim = spec.limits.filter(l => !l.ref).sort((a, b) => a.v - b.v);
  const firstAbove = (l: TrendLimit) => Math.min(...ss.map(x => x.raw.find(p => p[1] >= l.v)?.[0] ?? Infinity));
  const crossed = lim.map(l => ({ l, t: firstAbove(l) })).filter(c => c.t !== Infinity);
  if (crossed.length) txt += '. First above ' + crossed.map(c => `${c.l.label} ${c.l.v} on ${day(c.t)}`).join(', ');
  else if (lim.length) txt += `. Stayed below ${lim[0].label} (${lim[0].v})`;
  return txt + '.';
}

/** Ticks: 7 evenly spaced dates up to 2 months; month starts beyond (every 2nd month past ~7 months). */
function ticksFor(end: number, days: number) {
  if (days <= 62) {
    const step = days <= 8 ? 1 : days <= 16 ? 2 : days === 42 ? 7 : Math.max(1, Math.round(days / 6));
    const out: number[] = [];
    for (let d = 0; d >= -days; d -= step) out.unshift(d);
    return out.map(d => ({ x: d, label: dayMon(dateAt(end, d)) }));
  }
  const out: { x: number; label: string }[] = [];
  const every = days > 220 ? 2 : 1;
  for (let d = -days; d <= 0; d++) {
    const iso = dateAt(end, d);
    const m = +iso.slice(5, 7) - 1;
    if (iso.slice(8, 10) === '01' && m % every === 0) out.push({ x: d, label: `${MON[m]} ’${iso.slice(2, 4)}` });
  }
  return out;
}

const P = (id: string, def: number) => D.param(id, def);
const REFC = '#6b7a86';
function groupSpec(g: Group, aid: string): { title: string; unit: string; y_min: number | null; limits: TrendLimit[]; bands: TrendSpec['bands'] } {
  const a = D.asset[aid] || {};
  switch (g) {
    case 'vib': {
      const alarm = P('PRM-141', 4.5), trip = P('PRM-142', 7.1);
      return { title: 'Vibration (daily check)', unit: 'mm/s', y_min: 0,
        limits: [{ v: 2.8, label: 'Alert', color: '#b8860b' }, { v: alarm, label: 'Alarm', color: '#d2691e' }, { v: trip, label: 'Trip', color: '#c0392b' }],
        bands: [{ from: 0, to: 2.8, color: '#e3f1e6' }, { from: 2.8, to: alarm, color: '#fbf1cf' }, { from: alarm, to: trip, color: '#f8e2d2' }, { from: trip, to: 99, color: '#f4d6d6' }] };
    }
    case 'temp': return { title: 'Bearing temperature (daily check)', unit: '°C', y_min: null, bands: [],
      limits: [{ v: P('PRM-143', 80), label: 'Alarm', color: '#d2691e' }, { v: P('PRM-144', 90), label: 'Stop', color: '#c0392b' }] };
    case 'seal': return { title: 'Seal reservoir level (daily check)', unit: '%', y_min: null, limits: [], bands: [] };
    case 'flow': {
      const rated = Number(a.rated_flow_m3h) || 0;
      return { title: 'Flow (meter rounds)', unit: 'm³/h', y_min: 0, bands: [], limits: rated ? [{ v: rated, label: 'Rated', color: REFC, ref: true }] : [] };
    }
    case 'pressure': return { title: 'Discharge pressure (meter rounds)', unit: 'bar', y_min: null, bands: [],
      limits: /^P-101/.test(aid) ? [{ v: P('PRM-151', 2.1), label: 'Normal', color: REFC, ref: true }] : [] };
    case 'current': {
      const flc = /^M-101|^SP-M01/.test(aid) ? P('PRM-145', 12.8) : 0;
      return { title: 'Motor current (meter rounds)', unit: 'A', y_min: 0, bands: [],
        limits: flc ? [{ v: +(flc * P('PRM-146', 1.05)).toFixed(1), label: `${Math.round(P('PRM-146', 1.05) * 100)}% FLC`, color: '#c0392b' }] : [] };
    }
  }
}
/** One chart per selected indicator group (vibration, temperature, seal level, flow, pressure, current). */
export function trendsFor(aid: string, failureAt: string | null | undefined, opts: number | Partial<TrendOpts> | null = null, frame?: TrendFrame): TrendSpec[] {
  const o = trendOpts(typeof opts === 'number' ? { days: opts } : opts);
  const src = sourceOf(aid);
  const sh = frame?.shiftMin ?? D.shiftMin, asOf = frame?.asOfMin ?? parseDt(CLOCK.asOf)!;
  const end = Math.min(parseDt(failureAt ?? '') ?? asOf, asOf);
  let days = o.days;
  if (o.from) { const f = parseDt(o.from)!; if (f < end) days = Math.min(MAX_D, Math.max(1, Math.round((end - f) / DAY))); }
  const sel = new Set(o.indicators ?? defaultIndicators(src));
  const bin = binOf(days), start = end - days * DAY;
  const label = o.from ? `${days} days (from ${dateAt(end, -days)})` : windowLabel(days);
  const pad = Math.max(0.35, days * 0.025);
  const base = { x0: -days, x1: pad, fail_x: 0, ticks: ticksFor(end, days), end_label: `Failure ${dateAt(end, 0)}`,
    start_date: dateAt(end, -days), end_date: dateAt(end, 0), window_days: days, window_label: label };
  const out: TrendSpec[] = [];
  for (const g of GROUP_ORDER) {
    const inds = TREND_INDICATORS.filter(i => i.group === g && sel.has(i.key) && hasData(src, i));
    if (!inds.length) continue;
    const raws: [number, number][][] = [];
    const series: TrendSeries[] = inds.map(i => {
      const rows = i.tbl === 'dc' ? D.dcRows(src) : D.mrRows(src);
      const s = seriesOf(rows, i.col, end, start, i.tbl === 'dc', bin, sh);
      raws.push(s.raw);
      return { name: i.label, color: i.color, pts: s.pts, ...(s.band ? { band: s.band } : {}) };
    });
    if (!series.some(s => s.pts.length) && o.indicators === null) continue;
    const gs = groupSpec(g, src);
    const anyBand = series.some(s => s.band);
    const agg = bin > 1 ? `${BIN_NAME[bin]} mean${anyBand ? ' · shaded: min–max' : ''}` : anyBand ? 'daily mean · shaded: min–max of rounds' : undefined;
    const spec: TrendSpec = { ...base, ...gs, series, summary: '', ...(agg ? { agg } : {}) };
    if (src !== aid) spec.title = `${src} drive motor – ${spec.title.charAt(0).toLowerCase()}${spec.title.slice(1)}`;
    spec.summary = summarize(spec, raws, days);
    out.push(spec);
  }
  return out;
}

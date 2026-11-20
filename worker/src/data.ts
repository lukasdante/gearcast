/** Plant data (bundled, unshifted) + per-request date shift + status logic (port of backend data.py). */
import RAW from './generated/data.json';
import READ from './generated/readings.json';
import { Clock, DAY, dayStr, makeClock, minStr, shiftDates } from './time';
import { num } from './py';

const R: any = RAW;
const RD: any = READ;

const byKey = (rows: any[], k: string) => { const o: Record<string, any> = {}; for (const r of rows) o[r[k]] = r; return o; };
const groupBy = (rows: any[], k: string) => { const o: Record<string, any[]> = {}; for (const r of rows) (o[r[k]] ||= []).push(r); return o; };

/** All tables, date-shifted by `offset` days. Each table is shifted lazily on first use and cached per offset. */
export class Data {
  private c: Record<string, any> = {};
  constructor(public offset: number) {}
  private t(name: string, build: () => any) { return name in this.c ? this.c[name] : (this.c[name] = build()); }
  private s(name: string) { return this.t('raw:' + name, () => shiftDates(R[name], this.offset)); }

  get equipment(): any[] { return this.s('equipment'); }
  get asset(): Record<string, any> { return this.t('asset', () => byKey(this.equipment, 'asset_id')); }
  get equipmentStatus(): Record<string, any> { return this.t('es', () => byKey(this.s('equipmentStatus'), 'asset_id')); }
  get dutyRotation(): any[] { return this.s('dutyRotation'); }
  get nodes(): Record<string, any> { return this.t('nodes', () => byKey(this.s('nodes'), 'node_id')); }
  get pmStatus(): any[] { return this.s('pmStatus'); }
  get failures(): any[] { return this.s('failures'); }
  get workOrders(): any[] { return this.s('workOrders'); }
  get spares(): any[] { return this.s('spares'); }
  get spareSummary(): Record<string, any> { return this.t('ss', () => byKey(this.s('spareSummary'), 'asset_id')); }
  get procedures(): Record<string, any> { return this.t('proc', () => byKey(this.s('procedures'), 'procedure_id')); }
  get steps(): Record<string, any[]> { return this.t('steps', () => groupBy(this.s('procedureSteps'), 'procedure_id')); }
  get figures(): Record<string, any[]> { return this.t('figs', () => groupBy(this.s('procedureFigures'), 'procedure_id')); }
  get keyPoints(): Record<string, any[]> { return this.t('kp', () => groupBy(this.s('procedureKeyPoints'), 'procedure_id')); }
  get symptoms(): Record<string, any> { return this.t('sym', () => byKey(this.s('symptoms'), 'symptom_id')); }
  get questions(): Record<string, any> { return this.t('q', () => byKey(this.s('questions'), 'question_id')); }
  get incidentReports(): any[] { return this.s('incidentReports'); }
  get repairCases(): any[] { return this.s('repairCases'); }
  get costRef(): Record<string, any> { return this.t('cr', () => byKey(this.s('costRef'), 'cost_id')); }
  get lossScenarios(): any[] { return this.s('lossScenarios'); }
  get curtailLines(): Record<string, any> { return this.t('cl', () => byKey(this.s('curtailLines'), 'line_id')); }
  get suppliers(): Record<string, any> { return this.t('sup', () => byKey(this.s('suppliers'), 'supplier_id')); }
  get params(): Record<string, any> { return this.t('prm', () => byKey(this.s('params'), 'param_id')); }
  get plantParams(): Record<string, any> { return this.t('pprm', () => byKey(this.s('plantParams'), 'param_id')); }
  get irTemplate(): any[] { return R.irTemplate; }
  get symptomAliases(): Record<string, string> { return R.symptomAliases; }

  param(pid: string, def = 0.0): number {
    const p = this.params[pid] || this.plantParams[pid];
    return p ? num(p.value, def) : def;
  }

  // ---- readings: columnar rows with UNSHIFTED minutes (add shiftMin()); no per-row objects (CPU budget)
  /** daily checks (all rows, data order): [m, running(0/1), vib_de, vib_nde, temp_de, temp_nde, seal_pct] */
  dcRows(aid: string): any[][] { return RD.dc[aid] || []; }
  /** manual rounds with status Running (data order): [m, flow_m3h, discharge_pressure_bar, current_a] */
  mrRows(aid: string): any[][] { return RD.mr[aid] || []; }
  get shiftMin(): number { return this.offset * DAY; }
  dateOfMin(m: number): string { return dayStr(Math.floor(m / DAY)); }
  lastDc(aid: string): any { return this.t('ldc:' + aid, () => (RD.lastDc[aid] ? shiftDates(RD.lastDc[aid], this.offset) : null)); }
  lastMr(aid: string): any { return this.t('lmr:' + aid, () => (RD.lastMr[aid] ? shiftDates(RD.lastMr[aid], this.offset) : null)); }
}

let cache: Data | null = null;
export function dataFor(offset: number): Data {
  if (!cache || cache.offset !== offset) cache = new Data(offset);
  return cache;
}

// ------------------------------------------------------------------ request context (set per request)
export let D: Data = dataFor(0);
export let CLOCK: Clock = makeClock();
export function setContext(clock: Clock) { CLOCK = clock; D = dataFor(clock.offset); }
export const asOf = () => CLOCK.asOf;
export const nowStr = () => minStr(CLOCK.nowMin);

// ------------------------------------------------------------------ status logic (port of status.ts / data.py)
export const DOWN = new Set(['Shut Down', 'Under Maintenance', 'Not Available']);
export const DRIVER_OF: Record<string, string> = { 'P-101A': 'M-101A', 'P-101B': 'M-101B', 'SC-101A': 'VM-101A', 'SC-101B': 'VM-101B' };
export const SPARE_FOR: Record<string, string> = {
  'P-101A': 'SP-P01', 'P-101B': 'SP-P01', 'P-201A': 'SP-P02', 'P-201B': 'SP-P02',
  'M-101A': 'SP-M01', 'M-101B': 'SP-M01', 'VM-101A': 'SP-VM01', 'VM-101B': 'SP-VM01',
};
const GROUP_OF: [RegExp, string][] = [[/^(P-101|M-101|SP-P01|SP-M01)/, 'Transfer pumps'], [/^(P-201|SP-P02)/, 'Sump pumps'], [/^(SC-|VM-|SP-VM01)/, 'Screens']];

export function assetGroup(aid: string): string | null {
  for (const [rx, g] of GROUP_OF) if (rx.test(aid)) return g;
  return null;
}

export class StatusCtx {
  constructor(public status: Record<string, any>, public roles: Record<string, any>, public simulated: string[]) {}
  static fromClient(sim: any): StatusCtx {
    sim = sim || {};
    const st: Record<string, any> = {};
    for (const [k, v] of Object.entries(D.equipmentStatus)) st[k] = { ...v };
    const changed: string[] = [];
    for (const [aid, ov] of Object.entries<any>(sim.overrides || {})) {
      if (aid in st && ov && typeof ov === 'object' && !Array.isArray(ov) && ov.current_status) {
        if (ov.current_status !== st[aid].current_status) changed.push(aid);
        for (const k of ['current_status', 'status_since']) if (k in ov) st[aid][k] = ov[k];
        st[aid].status_source = 'Simulated';
      }
    }
    return new StatusCtx(st, sim.roleOverrides || {}, changed);
  }
  own(aid: string): string { return (this.status[aid] || {}).current_status ?? 'Not recorded'; }
}

export const isSpare = (aid: string) => aid.startsWith('SP-');

export function getStatus(ctx: StatusCtx, aid: string): string {
  const a = D.asset[aid] || {};
  if (a.parent_asset && DOWN.has(ctx.own(a.parent_asset))) return 'Stopped';
  const drv = DRIVER_OF[aid];
  if (drv && DOWN.has(ctx.own(drv))) return 'Not Available';
  return ctx.own(aid);
}

export function partnerOf(aid: string): string | null {
  const a = D.asset[aid];
  if (!a || !a.pair_id) return null;
  for (const o of D.equipment) if (o.asset_id !== aid && o.pair_id === a.pair_id && o.asset_type === a.asset_type) return o.asset_id;
  return null;
}

function rot(): any[] {
  const d = CLOCK.asOfDate;
  return D.dutyRotation.filter(r => r.date <= d).map((r, i) => ({ r, i })).sort((a, b) => (a.r.date < b.r.date ? 1 : a.r.date > b.r.date ? -1 : a.i - b.i)).map(x => x.r);
}

export function rotationRole(ctx: StatusCtx, aid: string): string {
  const a = D.asset[aid] || {};
  const ov = ctx.roles[a.pair_id || ''];
  if (ov) {
    if (ov.duty_asset === aid) return 'DUTY';
    if (ov.standby_asset === aid) return 'STBY';
  }
  if (/^M-101[AB]$/.test(aid)) return rotationRole(ctx, 'P-101' + aid.slice(-1));
  if (a.parent_asset) return rotationRole(ctx, a.parent_asset);
  if (isSpare(aid) || ctx.own(aid) === 'In Storage') return 'STORED';
  for (const r of rot()) if (aid === r.duty_asset || aid === r.standby_asset) return r.duty_asset === aid ? 'DUTY' : 'STBY';
  return 'NONE';
}

export function view(ctx: StatusCtx, aid: string) {
  const a = D.asset[aid] || {};
  const status = getStatus(ctx, aid);
  const role = rotationRole(ctx, aid);
  const p = partnerOf(aid);
  let note: string | null = null, level: string;
  if (status === 'Shut Down' || status === 'Not Available') level = 'fault';
  else if (status === 'Under Maintenance') level = 'maintenance';
  else if (status === 'Stopped') level = 'stopped';
  else if (status === 'In Storage' || isSpare(aid)) level = 'stored';
  else if (role === 'STBY') {
    level = 'standby';
    if (p && !a.parent_asset && DOWN.has(getStatus(ctx, p))) note = 'START NEEDED – partner is down';
  } else level = 'running';
  return {
    asset_id: aid, type: a.asset_type ?? null, description: a.description ?? null, status, role, level, partner: p, note,
    simulated: ctx.simulated.includes(aid), status_since: (ctx.status[aid] || {}).status_since ?? null,
  };
}

export const isDown = (ctx: StatusCtx, aid: string) => DOWN.has(getStatus(ctx, aid));

// ------------------------------------------------------------------ helpers
export function expandTargets(target: string): string[] {
  const out: string[] = [];
  for (let t of (target || '').split(/[;,]\s*/)) {
    t = t.trim();
    const m = /^(.*?)([A-Z])\/([A-Z])$/.exec(t);
    if (m) out.push(m[1] + m[2], m[1] + m[3]);
    else if (t) out.push(t);
  }
  return out;
}

export function money(v: any): string {
  const n = num(v);
  return n === null ? 'Not recorded' : `PHP ${fmtComma0(n)}`;
}
import { fmtComma } from './py';
const fmtComma0 = (n: number) => fmtComma(n, 0);

export function failuresFor(aid: string, sinceInstall = true): any[] {
  const inst: string = (D.asset[aid] || {}).install_date || '0000';
  const rows = D.failures.filter(f => f.asset_id === aid && (!sinceInstall || f.failure_at.slice(0, 10) >= inst.slice(0, 10)));
  return rows.map((r, i) => ({ r, i })).sort((a, b) => (a.r.failure_at < b.r.failure_at ? 1 : a.r.failure_at > b.r.failure_at ? -1 : a.i - b.i)).map(x => x.r);
}

export function procedureForText(text: any): any {
  const m = /\b([A-Z]{2}-\d{2})\b/.exec(String(text || '').toUpperCase());
  return m ? D.procedures[m[1]] ?? null : null;
}

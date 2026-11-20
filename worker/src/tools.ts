/** Read-only plant tools (port of backend tools.py). Every number the LLM repeats comes from here. */
import { CLOCK, D, DOWN, SPARE_FOR, StatusCtx, assetGroup, expandTargets, failuresFor, getStatus, partnerOf, view } from './data';
import { costEstimate, scenarioLoss } from './costs';
import * as rr from './rr';
import { search } from './rag';
import { num, pick, pyFloat, pyStr, sortBy, truthy } from './py';
import { DAY, parseDt } from './time';
import type { Env } from './env';

function assetOk(aid: any): string | null {
  if (!aid) return null;
  const a = String(aid).trim().toUpperCase();
  return a in D.asset ? a : null;
}

export function getPlantStatus(ctx: StatusCtx) {
  const rows = D.equipment.map(a => view(ctx, a.asset_id));
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.level] = (counts[r.level] || 0) + 1;
  return { as_of: CLOCK.asOf, simulated_changes: ctx.simulated, counts,
    assets: rows.map(r => pick(r, ['asset_id', 'type', 'status', 'role', 'partner', 'note', 'simulated'])) };
}

export function listAlarms(ctx: StatusCtx) {
  const alarms: any[] = [];
  for (const a of D.equipment) {
    const v = view(ctx, a.asset_id);
    if (DOWN.has(v.status) || v.note) alarms.push({ type: 'status', asset_id: v.asset_id, severity: 'high', text: `${v.asset_id} ${v.status}` + (v.note ? ` – ${v.note}` : ''), simulated: v.simulated });
  }
  for (const p of D.pmStatus) {
    if ((num(p.days_until_due, 99) || 0) < 0) alarms.push({ type: 'pm_overdue', asset_id: p.asset_id, severity: 'medium', text: `PM ${p.task_id} ${p.task} overdue ${-Math.trunc(Number(p.days_until_due))} d` });
  }
  for (const [sid, s] of Object.entries<any>(D.spareSummary)) {
    if (s.readiness_status !== 'Ready' || ['1', 'true'].includes(pyStr(s.overdue).toLowerCase()))
      alarms.push({ type: 'spare', asset_id: sid, severity: 'medium', text: `${sid} readiness ${pyStr(s.readiness_status)} (last check ${pyStr(s.last_check_date)})` });
  }
  for (const sp of D.spares) {
    if (truthy(sp.below_min) || num(sp.qty_on_hand, 0) < num(sp.min_qty, 0))
      alarms.push({ type: 'stock', asset_id: sp.fits_assets, severity: truthy(sp.critical) ? 'medium' : 'low', text: `${sp.part_id} ${sp.part_name}: ${pyStr(sp.qty_on_hand)} on hand < min ${pyStr(sp.min_qty)}` });
  }
  for (const r of latestReadingsAll()) if (r.flag) alarms.push({ type: 'reading', asset_id: r.asset_id, severity: 'medium', text: r.flag });
  return { as_of: CLOCK.asOf, count: alarms.length, alarms };
}

export function latestReadings(aid: string) {
  const lastC = D.lastDc(aid), lastR = D.lastMr(aid);
  let flag: string | null = null;
  if (lastC) {
    const vib = Math.max(num(lastC.vib_de_mm_s, 0) || 0, num(lastC.vib_nde_mm_s, 0) || 0);
    const temp = Math.max(num(lastC.temp_de_c, 0) || 0, num(lastC.temp_nde_c, 0) || 0);
    if (vib >= D.param('PRM-141', 4.5)) flag = `${aid} vibration ${pyFloat(vib)} mm/s ≥ alarm ${pyFloat(D.param('PRM-141'))} (${lastC.date})`;
    else if (temp >= D.param('PRM-143', 80)) flag = `${aid} bearing temperature ${pyFloat(temp)} °C ≥ alarm ${pyFloat(D.param('PRM-143'))} (${lastC.date})`;
  }
  return { asset_id: aid, daily_check: lastC, manual_round: lastR, flag };
}
export const latestReadingsAll = () => D.equipment.filter(a => !a.asset_id.startsWith('SP-')).map(a => latestReadings(a.asset_id));

export function pmFor(aid: string): any[] {
  return sortBy(D.pmStatus.filter(p => expandTargets(p.asset_id).includes(aid)), p => num(p.days_until_due, 9999));
}

export function getAsset(ctx: StatusCtx, assetId: any) {
  const aid = assetOk(assetId);
  if (!aid) return { error: `Unknown asset '${pyStr(assetId)}'. Known: ${Object.keys(D.asset).join(', ')}` };
  const a = D.asset[aid];
  const v = view(ctx, aid);
  const p = partnerOf(aid);
  const spare = SPARE_FOR[aid];
  const wos = sortBy(D.workOrders.filter(w => w.asset_id === aid), w => w.reported_at, true).slice(0, 5);
  return {
    asset: pick(a, ['asset_id', 'asset_type', 'description', 'manufacturer', 'model', 'location_node', 'install_date', 'expected_life_years', 'criticality', 'parent_asset', 'pair_id']),
    status: v, partner: p ? view(ctx, p) : null,
    stored_spare: spare ? { asset_id: spare, status: getStatus(ctx, spare), ...pick(D.spareSummary[spare] || {}, ['readiness_status', 'last_check_date', 'next_check_due']) } : null,
    recent_failures: failuresFor(aid).slice(0, 5).map(f => pick(f, ['event_id', 'failure_at', 'failure_mode', 'downtime_h', 'repair_cost_php', 'lesson_learned'])),
    recent_work_orders: wos.map(w => pick(w, ['wo_id', 'wo_type', 'title', 'reported_at', 'status', 'total_cost_php'])),
    pm_next: pmFor(aid).slice(0, 4).map(x => pick(x, ['task_id', 'task', 'next_due_date', 'days_until_due', 'status'])),
    latest_readings: latestReadings(aid),
  };
}

export function pmDue(assetId: any = null, days = 7) {
  let rows = assetId ? pmFor(String(assetId).toUpperCase()) : D.pmStatus;
  rows = sortBy(rows.filter(r => (num(r.days_until_due, 9999) || 0) <= days), r => num(r.days_until_due, 9999));
  return { as_of: CLOCK.asOfDate, window_days: days, count: rows.length,
    tasks: rows.slice(0, 25).map(r => pick(r, ['task_id', 'task', 'asset_id', 'next_due_date', 'days_until_due', 'status'])) };
}

export function spareStock(query: any = null, belowMin = false) {
  const q = String(query || '').trim().toLowerCase();
  const rows: any[] = [];
  for (const sp of D.spares) {
    const hay = `${pyStr(sp.part_id)} ${pyStr(sp.part_name)} ${pyStr(sp.fits_assets)} ${pyStr(sp.category)}`.toLowerCase();
    if (q && !hay.includes(q) && !expandTargets(q.toUpperCase()).filter(t => hay.includes(t.toLowerCase())).some(t => hay.includes(t))) continue;
    const low = truthy(sp.below_min) || num(sp.qty_on_hand, 0) < num(sp.min_qty, 0);
    if (belowMin && !low) continue;
    const sup = D.suppliers[sp.supplier_id || ''] || {};
    rows.push({ part_id: sp.part_id, name: sp.part_name, fits: sp.fits_assets, on_hand: sp.qty_on_hand, min: sp.min_qty, below_min: low,
      critical: sp.critical ?? null, lead_time_days: sp.lead_time_days ?? null, unit_cost_php: sp.unit_cost_php ?? null, supplier: sup.supplier_name ?? null });
  }
  const stored = Object.entries<any>(D.spareSummary).map(([k, v]) => ({ asset_id: k, ...pick(v, ['spare_type', 'readiness_status', 'last_check_date', 'next_check_due']) }));
  return { parts: rows.slice(0, 30), count: rows.length, stored_and_standby_units: stored };
}

export function failureHistory(assetId: any) {
  const aid = assetOk(assetId);
  if (!aid) return { error: `Unknown asset '${pyStr(assetId)}'` };
  const fs = failuresFor(aid, false);
  const now = parseDt(CLOCK.asOf)!;
  const last12 = fs.filter(f => (parseDt(f.failure_at) ?? -Infinity) >= now - 365 * DAY);
  return { asset_id: aid, install_date: D.asset[aid].install_date ?? null, count_total: fs.length, count_last_12m: last12.length,
    failures: fs.map(f => pick(f, ['event_id', 'failure_at', 'symptom', 'failure_mode', 'root_cause', 'downtime_h', 'repair_cost_php', 'lesson_learned'])) };
}

export function lossEstimate(ctx: StatusCtx, assetId: any = null, groupName: any = null, outageH = 8, pairDown: any = null) {
  if (assetId && assetOk(assetId)) {
    const aid = assetOk(assetId)!;
    const est: any = costEstimate(ctx, aid, outageH, '', true);
    if (truthy(pairDown) && !est.pair_down) est.what_if_pair_down = scenarioLoss(assetGroup(aid), Number(outageH));
    return est;
  }
  const group = groupName || 'Transfer pumps';
  return { group, what_if_pair_down: scenarioLoss(group, Number(outageH)),
    note: 'Loss applies only when both units of the pair are unavailable; with a ready standby the loss is PHP 0.' };
}

export async function searchKnowledge(env: Env, query: string, assetId: any = null, k = 5) {
  const hits = await search(env, query, { k, asset_id: assetOk(assetId) });
  return { query, results: hits.map(h => ({ ...h, text: h.text.slice(0, 600) })) };
}

export function repairOrReplace(assetId: any = null, caseId: any = null, repairCostPhp: any = null) {
  if (caseId) {
    const c = rr.cases().find(x => x.case.case_id === String(caseId).toUpperCase());
    return c || { error: `Unknown case ${pyStr(caseId)}` };
  }
  const aid = assetOk(assetId);
  if (!aid) return { error: 'Give asset_id or case_id' };
  const p = rr.predict(rr.liveFeatures(aid, repairCostPhp === null || repairCostPhp === undefined ? null : Number(repairCostPhp)));
  return { asset_id: aid, ...pick(p, ['recommendation', 'confidence', 'rules', 'factors', 'costs', 'features']), model: p.model.name };
}

// --------------------------------------------------------------------------- OpenAI tool schemas
const fn = (name: string, description: string, properties: any = {}, required: string[] = []) =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const ASSET = { type: 'string', description: 'Asset tag, e.g. P-101B, M-101A, SC-101A, SP-P01' };
export const TOOL_SCHEMAS = [
  fn('get_plant_status', "Current status and duty/standby role of every tracked asset (includes the user's simulated changes)."),
  fn('list_alarms', 'Active alarms: assets shut down / not available, standby start needed, overdue PM, spares not ready, low stock, readings over alarm limits.'),
  fn('get_asset', 'Details for one asset: register data, status, partner unit, stored spare readiness, recent failures and work orders, next PM, latest readings.', { asset_id: ASSET }, ['asset_id']),
  fn('pm_due', 'Preventive maintenance tasks due within N days (optionally for one asset).', { asset_id: ASSET, days: { type: 'integer', default: 7 } }),
  fn('spare_stock', 'Spare part stock (search by part, asset tag or category) and stored/standby unit readiness.', { query: { type: 'string' }, below_min: { type: 'boolean' } }),
  fn('failure_history', 'All recorded failures for an asset with failure mode, root cause, downtime, repair cost and lesson learned.', { asset_id: ASSET }, ['asset_id']),
  fn('loss_estimate', 'Production-loss and repair-cost estimate for an outage (Loss_Scenarios). Loss is PHP 0 while a standby is available; set pair_down=true for a what-if with both units down.',
    { asset_id: ASSET, asset_group_name: { type: 'string', enum: ['Transfer pumps', 'Sump pumps', 'Screens'] }, outage_h: { type: 'number' }, pair_down: { type: 'boolean' } }),
  fn('search_knowledge', 'Search procedures, symptoms, failure lessons, the WWTP maintenance manual and uploaded manuals. Returns cited chunks.',
    { query: { type: 'string' }, asset_id: ASSET }, ['query']),
  fn('repair_or_replace', 'Repair-or-replace model output (GearCast RR-Model v1) for an asset or a recorded case RR-01..RR-11.',
    { asset_id: ASSET, case_id: { type: 'string' }, repair_cost_php: { type: 'number' } }),
];

const TOOL_LABELS: Record<string, string> = {
  get_plant_status: 'Checking plant status', list_alarms: 'Checking alarms', get_asset: 'Looking up {asset_id}',
  pm_due: 'Checking PM schedule', spare_stock: 'Checking spare stock', failure_history: 'Reading failure history{for_asset}',
  loss_estimate: 'Estimating downtime loss', search_knowledge: 'Searching manuals & procedures', repair_or_replace: 'Running repair-or-replace model',
};
export function labelFor(name: string, args: any): string {
  const t = TOOL_LABELS[name] ?? name;
  return t.replace('{asset_id}', args.asset_id ?? 'asset').replace('{for_asset}', args.asset_id ? ` for ${args.asset_id}` : '');
}

export async function runTool(env: Env, ctx: StatusCtx, name: string, args: any): Promise<any> {
  const a: any = {};
  for (const [k, v] of Object.entries(args || {})) if (v !== null && v !== undefined) a[k] = v;
  switch (name) {
    case 'get_plant_status': return getPlantStatus(ctx);
    case 'list_alarms': return listAlarms(ctx);
    case 'get_asset': return getAsset(ctx, a.asset_id ?? '');
    case 'pm_due': return pmDue(a.asset_id, Math.trunc(Number(a.days ?? 7)));
    case 'spare_stock': return spareStock(a.query, truthy(a.below_min));
    case 'failure_history': return failureHistory(a.asset_id ?? '');
    case 'loss_estimate': return lossEstimate(ctx, a.asset_id, a.asset_group_name, Number(a.outage_h ?? 8), a.pair_down);
    case 'search_knowledge': return searchKnowledge(env, a.query ?? '', a.asset_id);
    case 'repair_or_replace': return repairOrReplace(a.asset_id, a.case_id, a.repair_cost_php);
  }
  return { error: `unknown tool ${name}` };
}

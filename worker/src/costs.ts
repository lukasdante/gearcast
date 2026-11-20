/** Deterministic cost + production-loss model (port of backend costs.py). */
import { D, StatusCtx, assetGroup, isDown, partnerOf, procedureForText } from './data';
import { fixed, fmtComma, num, or, pyRound, pyStr, sortBy, truthy } from './py';

export function repairCost(procedureText: any) {
  const p = procedureForText(procedureText);
  if (!p) return { procedure_id: null, unknown_procedure: truthy(String(procedureText || '').trim()), labour: 0.0, parts: 0.0, part_rows: [] as any[], repair: 0.0 };
  const electrician = /electrical|motor/i.test(`${pyStr(p.category === undefined ? '' : p.category)} ${pyStr(p.skills === undefined ? '' : p.skills)}`);
  const rate = D.param(electrician ? 'PRM-111' : 'PRM-110');
  const labour = or(num(p.crew_size, 0), 0) * or(num(p.est_time_h, 0), 0) * rate;
  let parts = 0.0;
  const rows: any[] = [];
  for (const pid of String(p.parts || '').match(/SPP-\d{3}/g) || []) {
    const sp = D.spares.find(x => x.part_id === pid);
    if (!sp) continue;
    let cost = or(num(sp.unit_cost_php, 0), 0);
    const emergency = or(num(sp.qty_on_hand, 0), 0) === 0;
    if (emergency) cost = cost * (1 + D.param('PRM-114')) + D.param('PRM-115');
    parts += cost;
    rows.push({ part_id: pid, name: sp.part_name, stock: sp.qty_on_hand ?? null, cost_php: pyRound(cost), emergency });
  }
  return { procedure_id: p.procedure_id, unknown_procedure: false, labour: pyRound(labour), parts: pyRound(parts), part_rows: rows, repair: pyRound(labour + parts) };
}

export function defaultOutageH(aid: string): number {
  const g = assetGroup(aid);
  return g === 'Screens' ? 4 : g === 'Sump pumps' ? 3 : 8;
}

export function scenarioLoss(group: string | null, hours: number): any {
  let rows = D.lossScenarios.filter(x => x.asset_group === group && !truthy(x.standby_ready) && x.inflow_case === 'Average');
  rows = sortBy(rows, x => Math.abs(num(x.outage_h, 0) - hours));
  const sc = rows.find(x => num(x.outage_h) === hours) ?? (rows.length ? rows[0] : null);
  if (!sc) return { scenario: null, production: 0.0, note: 'No matching Loss_Scenarios row' };
  const daily = D.param('PRM-006');
  const cr16 = num((D.costRef['CR-16'] || {}).value, 3000);
  let lines = String(sc.lines_curtailed || '').split(';').filter(i => i.trim() in D.curtailLines).map(i => D.curtailLines[i.trim()]);
  lines = sortBy(lines, x => x.curtail_order);
  let restartTimeLoss = 0;
  for (const x of lines) restartTimeLoss += num(x.revenue_share, 0) * num(x.restart_time_h, 0) * daily / 24;
  const buffer = or(num(sc.buffer_h, 0), 0);
  const exact = num(sc.outage_h) === hours;
  let production: number, lostRev: number, restart: number, fine: number, overtime: number, beyond: number, base: number;
  if (exact) {
    production = num(sc.total_loss_php, 0);
    lostRev = num(sc.lost_revenue_php, 0);
    restart = num(sc.restart_cost_php, 0);
    fine = num(sc.fine_php, 0);
    overtime = num(sc.overtime_php, cr16 * hours);
    beyond = num(sc.hours_beyond_buffer, Math.max(0, hours - buffer));
    base = lostRev - restartTimeLoss;
  } else {
    beyond = Math.max(0.0, hours - buffer);
    let s = 0; for (const x of lines) s += num(x.revenue_share, 0);
    const share = or(num(sc.revenue_lost_share), s);
    base = share * beyond / 24 * daily;
    let rs = 0; for (const x of lines) rs += num(x.restart_cost_php, 0);
    restart = or(num(sc.restart_cost_php), rs);
    fine = num(sc.fine_php, 0);
    overtime = cr16 * hours;
    lostRev = base + restartTimeLoss;
    production = lostRev + restart + fine + overtime;
  }
  const bufferText = group === 'Screens' ? 'No buffer – screens are upstream of the EQ tank; plant stops immediately'
    : group === 'Transfer pumps' ? 'EQ buffer ≈ 2.5 h' : `Sump buffer ≈ ${fixed(buffer, 2)} h`;
  return {
    scenario: sc.scenario_id, scenario_title: sc.title, exact_scenario: exact, outage_h: hours,
    buffer_h: buffer, buffer_text: bufferText, hours_beyond_buffer: pyRound(beyond, 2),
    lines_curtailed: lines.map(x => x.line_name), response: sc.response ?? null,
    lost_revenue: pyRound(lostRev), base_loss: pyRound(base), restart_time_loss: pyRound(restartTimeLoss),
    restart_cost: pyRound(restart), fine: pyRound(fine), overtime: pyRound(overtime), production: pyRound(production),
  };
}

export function costEstimate(ctx: StatusCtx, aid: string, hours: number | null = null, procedureText = '', forceDown = false) {
  const h = hours !== null && hours !== undefined ? Number(hours) : defaultOutageH(aid);
  const partner = partnerOf(aid);
  const ownDown = forceDown || isDown(ctx, aid);
  const partnerDown = !!partner && isDown(ctx, partner);
  const pairDown = !!partner && ownDown && partnerDown;
  const group = assetGroup(aid);
  const rep = repairCost(procedureText);
  const loss = pairDown ? scenarioLoss(group, h) : null;
  const production = loss ? loss.production : 0;
  let explanation: string;
  if (pairDown) explanation = `PHP ${fmtComma(production, 0)} – both ${(group || 'units').toLowerCase()} down ${fixed(h, 1)} h (${loss.scenario || 'loss scenario'})`;
  else if (partner) explanation = `PHP 0 – standby ${partner} available (start within buffer)`;
  else explanation = 'PHP 0 – no paired unit; no plant loss modelled';
  return {
    asset_id: aid, group, partner, standby_ready: !!partner && !partnerDown,
    own_down: ownDown, partner_down: partnerDown, pair_down: pairDown, outage_h: h,
    loss, production_loss: production, labour: rep.labour, parts: rep.parts,
    part_rows: rep.part_rows, repair: rep.repair, procedure_id: rep.procedure_id,
    unknown_procedure: rep.unknown_procedure, total: pyRound(production + rep.repair),
    explanation,
  };
}

/** Incident report (port of backend incidents.py): linked data, costs, LLM narrative fill of the 37 template fields,
 * validation, submission (IR-YYYY-NNN) stored in D1. */
import { CLOCK, D, DRIVER_OF, SPARE_FOR, StatusCtx, money, nowStr, partnerOf, procedureForText, view } from './data';
import { costEstimate } from './costs';
import * as rr from './rr';
import { completeJson } from './llm';
import { pmFor } from './tools';
import { fmtComma, fmtInt, num, pct0, pick, pyFloat, pyStr, sortBy, strip, truthy } from './py';
import { DATA_CUTOFF, DAY, fmtDate, hourOf, parseDt, yearOf } from './time';
import type { Env } from './env';
import { trendIndicators, trendOpts, trendsFor, withDefaults, type TrendFrame, type TrendOpts } from './trend';

const PICK: Record<number, string[]> = {
  3: ['Minor', 'Major', 'Critical', 'Near miss'],
  9: ['Trip', 'Noise', 'Leak observed', 'Flow drop', 'Rounds reading', 'Inspection'],
  10: ['Running', 'Starting', 'Standby', 'Stopped'],
  18: ['None', 'Curtail', 'Bypass', 'Shutdown'],
  21: ['None', 'Near miss', 'Injury'],
  30: ['Repair', 'Repair – watch', 'Replace', 'Not required'],
  36: ['No change', 'Shut Down', 'Under Maintenance'],
};
const CHECKLIST = ['Lubrication', 'Contamination', 'Misalignment', 'Wrong part', 'End of life', 'Handling/storage', 'Vibration', 'Operation error', 'Maintenance missed'];
const MECHANISMS = ['Wear', 'Fatigue', 'Corrosion', 'Clogging', 'Overheating', 'Electrical', 'Leakage', 'Mechanical damage', 'Other'];
const INDICATORS: [string, 'dc' | 'mr', string, string][] = [
  ['Vibration DE (mm/s)', 'dc', 'vib_de_mm_s', 'alarm 4.5 · trip 7.1'],
  ['Vibration NDE (mm/s)', 'dc', 'vib_nde_mm_s', 'alarm 4.5 · trip 7.1'],
  ['Bearing temp DE (°C)', 'dc', 'temp_de_c', 'alarm 80 · stop 90'],
  ['Bearing temp NDE (°C)', 'dc', 'temp_nde_c', 'alarm 80 · stop 90'],
  ['Seal reservoir level (%)', 'dc', 'seal_reservoir_level_pct', 'normal band'],
  ['Flow (m³/h)', 'mr', 'flow_m3h', 'drop > 20% of rated'],
  ['Discharge pressure (bar)', 'mr', 'discharge_pressure_bar', 'normal ≈ 2.1'],
  ['Current (A)', 'mr', 'current_a', '≤ 105% FLC (13.4 A)'],
];

// --------------------------------------------------------------------------- storage (D1)
async function loadSubmitted(env: Env): Promise<any[]> {
  const rs = await env.DB.prepare('SELECT rec FROM incidents ORDER BY seq').all();
  return (rs.results as any[]).map(r => JSON.parse(r.rec));
}

export async function nextReportId(env: Env, year: number, submitted?: any[]): Promise<string> {
  const ids = [...D.incidentReports.map(r => r.report_id), ...(submitted ?? (await loadSubmitted(env))).map(r => r.report_id)];
  const rx = new RegExp(`^IR-${year}-(\\d+)`);
  const nums = ids.map(i => rx.exec(i)).filter(m => m).map(m => parseInt(m![1], 10));
  return `IR-${year}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
}

export async function listReports(env: Env) {
  const hist = D.incidentReports.map(r => ({ report_id: r.report_id, asset_id: r.asset_id, date: r.incident_date, severity: r.severity,
    failure_mode: r.failure_mode ?? null, status: r.status ?? null, summary: r.expected_report_text ?? null, procedure_used: r.procedure_used ?? null,
    production_loss_php: num(r.production_loss_php), repair_cost_php: num(r.repair_cost_php), source: 'history' }));
  const sub = (await loadSubmitted(env)).map(r => ({ report_id: r.report_id, asset_id: r.asset_id, date: (r.failure_at || '').slice(0, 10),
    severity: (r.fields_by_no['3'] || {}).value ?? null, failure_mode: (r.fields_by_no['22'] || {}).value ?? null,
    status: 'Submitted', summary: r.summary ?? null, shut_down: r.shut_down ?? null, submitted_at: r.submitted_at ?? null, source: 'submitted' }));
  return { submitted: sortBy(sub, x => x.report_id, true), history: sortBy(hist, x => x.report_id, true) };
}

export async function deleteReport(env: Env, id: string): Promise<boolean> {
  const r = await env.DB.prepare('DELETE FROM incidents WHERE report_id = ?').bind(id).run();
  return (r.meta?.changes ?? 0) > 0;
}

export async function getReport(env: Env, id: string): Promise<any | null> {
  const r = await env.DB.prepare('SELECT rec FROM incidents WHERE report_id = ?').bind(id).first<string>('rec');
  if (r) return JSON.parse(r);
  const h = D.incidentReports.find(x => x.report_id === id);
  return h ? { report_id: id, history: h } : null;
}

// --------------------------------------------------------------------------- linked data
const DC_COL: Record<string, number> = { vib_de_mm_s: 2, vib_nde_mm_s: 3, temp_de_c: 4, temp_nde_c: 5, seal_reservoir_level_pct: 6 };
const MR_COL: Record<string, number> = { flow_m3h: 1, discharge_pressure_bar: 2, current_a: 3 };

/** Last row (data order) with a value in column `col` and time <= t (times shifted by `sh`). dc rows must be running. */
function lastAtOrBefore(rows: any[][], col: number, t: number, sh: number, needRunning: boolean): any[] | null {
  let last: any[] | null = null;
  for (const r of rows) if ((!needRunning || r[1]) && r[col] !== null && r[col] !== undefined && r[0] + sh <= t) last = r;
  return last;
}

/** readingsTable, falling back to the drive motor for assets without sensors (screens → VM-101A/B). */
export function readingsFor(aid: string, at: number): any[] {
  const own = readingsTable(aid, at);
  const drv = DRIVER_OF[aid];
  if (own.length || !drv) return own;
  return readingsTable(drv, at).map(r => ({ ...r, indicator: `${drv} ${r.indicator}` }));
}

export function readingsTable(aid: string, at: number): any[] {
  const end = Math.min(at, parseDt(CLOCK.asOf)!);
  const sh = D.shiftMin;
  const out: any[] = [];
  for (const [label, tbl, key, limit] of INDICATORS) {
    const rows = tbl === 'dc' ? D.dcRows(aid) : D.mrRows(aid);
    const col = tbl === 'dc' ? DC_COL[key] : MR_COL[key];
    const dc = tbl === 'dc';
    if (!rows.some(r => (!dc || r[1]) && r[col] !== null && r[col] !== undefined)) continue;
    const a = lastAtOrBefore(rows, col, end - 42 * DAY, sh, dc), b = lastAtOrBefore(rows, col, end - DAY, sh, dc);
    if (!b) continue;
    const va = a ? a[col] : null, vb = b[col];
    const trend = va === null ? '' : vb > va * 1.1 ? 'rising' : vb < va * 0.9 ? 'falling' : 'steady';
    out.push({ indicator: label, six_weeks_before: va, day_before: vb, limit, comment: strip(`${trend} (${D.dateOfMin(b[0] + sh)})`) });
  }
  return out;
}

function alertsFor(aid: string, at: number): string[] {
  const out: string[] = [];
  for (const p of pmFor(aid)) {
    const d = num(p.days_until_due);
    if (d !== null && d < 0) out.push(`PM ${p.task_id} ${p.task} overdue ${-Math.trunc(d)} d`);
    else if (String(p.status ?? '').startsWith('Coming up')) out.push(`PM ${p.task_id} ${p.task} due ${pyStr(p.next_due_date)}`);
  }
  const end = Math.min(at, parseDt(CLOCK.asOf)!);
  const sh = D.shiftMin, start = end - 14 * DAY;
  for (const r of D.dcRows(aid)) {
    const t = r[0] + sh;
    if (!(start <= t && t <= end)) continue;
    const vib = Math.max(num(r[2], 0) || 0, num(r[3], 0) || 0);
    if (vib >= 2.8) { out.push(`${D.dateOfMin(t)}: vibration ${pyFloat(vib)} mm/s ≥ 2.8 (AR-01 advance alignment/bearing check)`); break; }
  }
  const sp = D.spareSummary[aid];
  if (sp && ['1', 'true'].includes(pyStr(sp.overdue).toLowerCase())) out.push(`Standby check overdue (last ${pyStr(sp.last_check_date)})`);
  return out.length ? out : ['None fired in the 14 days before the failure'];
}

function gather(ctx: StatusCtx, f: any) {
  const aid = f.asset_id.toUpperCase();
  const a = D.asset[aid];
  const at = parseDt(f.failure_at) ?? parseDt(CLOCK.asOf)!;
  const fe = D.failures.find(x => x.asset_id === aid && Math.abs(((parseDt(x.failure_at) ?? at) - at) * 60) < 86400) ?? null;
  const proc = procedureForText(f.procedure_used);
  const hours = num(f.downtime_h);
  const est = costEstimate(ctx, aid, hours, f.procedure_used || '', !!f.shut_down);
  const rrOut = rr.predict(rr.liveFeatures(aid, est.repair || null, est.production_loss));
  const partner = partnerOf(aid);
  const pv = partner ? view(ctx, partner) : null;
  const spare = SPARE_FOR[aid] ?? null;
  const standby = pv ? (pv.status === 'In Service' ? `Started – ${partner}` : `Not available – ${partner} ${pv.status}`) : 'None';
  const wos = sortBy(D.workOrders.filter(w => w.asset_id === aid), w => w.reported_at, true);
  const node = D.nodes[a.location_node || ''] || {};
  const base = (s: string) => s.replace(/[AB]+$/, '');
  const similar = D.failures.filter(x => base(x.asset_id) === base(aid)).slice(-4);
  return {
    asset: a, node, failure_event: fe, procedure: proc, cost: est, rr: rrOut, standby, spare, partner, partner_status: pv ? pv.status : null,
    readings: readingsFor(aid, at), alerts: alertsFor(aid, at),
    work_orders: wos.slice(0, 3).map(w => pick(w, ['wo_id', 'title', 'reported_at', 'status', 'total_cost_php'])),
    open_work_orders: wos.filter(w => w.status !== 'Closed').map(w => w.wo_id),
    pm: pmFor(aid).slice(0, 4).map(p => pick(p, ['task_id', 'task', 'next_due_date', 'status'])),
    similar_failures: similar.map(x => pick(x, ['event_id', 'asset_id', 'failure_at', 'symptom', 'failure_mode', 'root_cause', 'repair_action', 'lesson_learned'])),
  };
}

function severity(f: any, g: any): string {
  if (g.cost.pair_down || g.cost.production_loss > 0) return 'Critical';
  if (f.shut_down || (num(f.downtime_h, 0) || 0) >= 4) return 'Major';
  return 'Minor';
}

// --------------------------------------------------------------------------- draft
const NARRATIVE_SYSTEM = `You fill the narrative fields of a wastewater-treatment-plant equipment incident report from the
technician's notes and the linked records. Facts only: never invent readings, times, costs or part numbers. If the notes
do not say something, write "Not recorded" (or for engineer fields, a clearly-marked suggestion). Plain, short sentences.
Return JSON with keys:
 symptom_observed (str, cleaned-up facts from the notes),
 detected_by (one of: Trip, Noise, Leak observed, Flow drop, Rounds reading, Inspection),
 operating_condition (one of: Running, Starting, Standby, Stopped),
 actions (list of {"time": "HH:MM" or "", "action": str, "by": role code or ""} parsed from the notes, in order),
 failure_mode (short, ISO 14224 style, e.g. "Mechanical seal leak"),
 failure_mechanism (one of: Wear, Fatigue, Corrosion, Clogging, Overheating, Electrical, Leakage, Mechanical damage, Other),
 direct_cause (str, suggested), whys (list of up to 5 short "why" answers, suggested),
 root_cause_checklist (subset of: Lubrication, Contamination, Misalignment, Wrong part, End of life, Handling/storage,
   Vibration, Operation error, Maintenance missed),
 repair_done (str or "Not recorded"),
 corrective_actions (list of up to 3 {"action": str, "owner": role, "due": "YYYY-MM-DD", "status": "Open"}),
 lesson_learned (1–2 sentences),
 summary (one paragraph in the style of the example report text, using only given facts and numbers).`;

import { dumps } from './py';
async function llmNarrative(env: Env, f: any, g: any) {
  const ex = (D.incidentReports.find(r => r.failure_event_id) || {}).expected_report_text ?? '';
  const facts = {
    asset: `${g.asset.asset_id} – ${g.asset.description}`, failure_at: f.failure_at, technician_notes: f.observed, actions_taken_notes: f.actions_taken,
    detected_by_hint: f.detected_by, procedure_used: f.procedure_used, parts_used: f.parts_used, downtime_h: f.downtime_h,
    shut_down_decision: !!f.shut_down, standby: g.standby, production_loss_php: g.cost.production_loss, repair_estimate_php: g.cost.repair,
    repair_or_replace: g.rr.recommendation, readings_before: g.readings, alerts: g.alerts, matching_failure_record: g.failure_event,
    similar_past_failures: g.similar_failures, report_date: CLOCK.asOf.slice(0, 10),
  };
  return completeJson(env, NARRATIVE_SYSTEM, `Example report text:\n${ex}\n\nFacts (JSON):\n${dumps(facts)}`, 2200);
}

function pickVal(v: any, allowed: string[], def: string): string {
  if (!v) return def;
  const s = pyStr(v);
  for (const a of allowed) if (strip(s).toLowerCase() === a.toLowerCase() || s.toLowerCase().startsWith(a.toLowerCase())) return a;
  return def;
}
const shiftName = (at: number) => { const h = hourOf(at); return h >= 6 && h < 14 ? 'Day' : h >= 14 && h < 22 ? 'Swing' : 'Night'; };

export const DRAFT_KEYS = ['asset_id', 'failure_at', 'reported_by', 'shift', 'detected_by', 'operating_condition', 'observed', 'actions_taken',
  'downtime_h', 'procedure_used', 'parts_used', 'spare_used', 'safety_injury', 'severity', 'shut_down', 'trend_days', 'trend'];

export async function buildDraft(env: Env, f: any, sim: any, useLlm = true): Promise<any> {
  const aid = String(f.asset_id || '').toUpperCase();
  if (!(aid in D.asset)) throw new Error(`Unknown asset ${aid}`);
  f.asset_id = aid;
  const ctx = StatusCtx.fromClient(sim);
  const g = gather(ctx, f);
  const ai: any = useLlm ? await llmNarrative(env, f, g) : {};
  const aiOn = Object.keys(ai).length > 0;
  const at = parseDt(f.failure_at) ?? parseDt(CLOCK.asOf)!;
  const rid = await nextReportId(env, yearOf(at));
  const c: any = g.cost, fe: any = g.failure_event || {}, proc = g.procedure;
  const loss: any = c.loss || {};
  const actions: any[] = ai.actions || [];
  const whys: any[] = (ai.whys || []).slice(0, 5);
  const capa: any[] = (ai.corrective_actions || []).slice(0, 4);
  const partsRows = c.part_rows;
  const partsText = f.parts_used || (partsRows.map((p: any) => `${p.part_id} × 1 · PHP ${fmtInt(p.cost_php)}${p.emergency ? ' (emergency)' : ''}`).join('; ') || 'None');
  const sev = pickVal(f.severity, PICK[3], severity(f, g));
  // the loss scenario's own response (Curtail / Bypass / Shutdown) when the whole pair is down
  const prodImpact = !c.pair_down ? 'None' : ['Curtail', 'Bypass', 'Shutdown'].includes(loss.response) ? loss.response : 'Curtail';
  const resulting = f.shut_down ? 'Shut Down' : 'No change';
  const F = (no: number, value: any, source: string) => {
    const t = D.irTemplate.find(x => x.field_no === no);
    return { field_no: no, section: t.section, field: t.field, filled_by: t.filled_by, allowed_values: t.allowed_values, value, source };
  };
  const aiSrc = aiOn ? 'ai' : 'data';
  const trend = withDefaults(aid, trendOpts(f.trend ?? { days: f.trend_days }));
  const fields = [
    F(1, rid, 'data'), F(2, f.report_date || fmtDate(nowStr(), true), 'data'),
    F(3, sev, f.severity ? 'user' : 'data'),
    F(4, [fe.event_id, fe.main_wo_id, ...g.open_work_orders.slice(0, 2), loss.scenario].filter(x => x).join(' · ') || 'New event – no failure record or open work order yet', 'data'),
    F(5, `${aid} – ${g.asset.description}`, 'data'),
    F(6, `${pyStr(g.asset.location_node)} – ${g.node.node_name ?? 'Not recorded'}`, 'data'),
    F(7, fmtDate(f.failure_at, true), 'user'),
    F(8, `${f.shift || shiftName(at)} · ${f.reported_by || 'Not recorded'}`, f.reported_by ? 'user' : 'data'),
    F(9, pickVal(f.detected_by || ai.detected_by, PICK[9], 'Inspection'), f.detected_by ? 'user' : aiSrc),
    F(10, pickVal(f.operating_condition || ai.operating_condition, PICK[10], 'Running'), f.operating_condition ? 'user' : aiSrc),
    F(11, ai.symptom_observed || f.observed || 'Not recorded', ai.symptom_observed ? aiSrc : 'user'),
    F(12, g.readings.map(r => `${r.indicator}: ${pyStr(r.six_weeks_before)} → ${pyStr(r.day_before)} (${r.comment}; limit ${r.limit})`).join('\n') || 'Not recorded', 'data'),
    F(13, g.alerts.join('\n'), 'data'),
    F(14, actions.map(a => `${a.time || '--:--'} ${pyStr(a.action)}` + (a.by ? ` (${a.by})` : '')).join('\n') || f.actions_taken || 'Not recorded', actions.length ? aiSrc : 'user'),
    F(15, proc ? `${proc.procedure_id} · ${proc.title}` : f.procedure_used || 'Not recorded', f.procedure_used ? 'user' : 'data'),
    F(16, f.standby_used || g.standby, f.standby_used ? 'user' : 'data'),
    F(17, f.downtime_h !== null && f.downtime_h !== undefined && f.downtime_h !== '' ? `${pyFloat(Number(f.downtime_h))} h (so far)` : 'Not recorded', 'user'),
    F(18, prodImpact, 'data'),
    F(19, costText(c), 'data'),
    F(20, c.pair_down ? `Bypass 0 h · fine ${money(loss.fine ?? 0)}` : 'None – standby covered (no bypass)', 'data'),
    F(21, pickVal(f.safety_injury, PICK[21], 'None'), f.safety_injury ? 'user' : 'data'),
    F(22, ai.failure_mode || fe.failure_mode || 'Not recorded', ai.failure_mode ? 'ai' : 'data'),
    F(23, aiOn ? pickVal(ai.failure_mechanism, MECHANISMS, 'Other') : 'Not recorded', aiSrc),
    F(24, ai.direct_cause || 'Not recorded', aiSrc),
    F(25, whys.map((w, i) => `Why ${i + 1}: ${pyStr(w)}`).join('\n') || fe.root_cause || 'Not recorded', aiSrc),
    F(26, (ai.root_cause_checklist || []).filter((x: any) => CHECKLIST.includes(x)).join(', ') || 'Not recorded', aiSrc),
    F(27, ai.repair_done || f.repair_done || fe.repair_action || 'Not recorded', aiSrc),
    F(28, partsText, f.parts_used ? 'user' : 'data'),
    F(29, c.repair ? `${money(c.repair)} (labour ${money(c.labour)} + parts ${money(c.parts)})` : 'Not recorded', 'data'),
    F(30, pickVal(g.rr.recommendation, PICK[30], 'Repair') + ` · RR-Model v1, confidence ${pct0(g.rr.confidence)}`, 'data'),
    F(31, capa.map((a, i) => `${i + 1}. ${pyStr(a.action)} – ${pyStr(a.owner)} – due ${pyStr(a.due)} – ${pyStr('status' in a ? a.status : 'Open')}`).join('\n') || 'Not recorded', aiSrc),
    F(32, ai.lesson_learned || 'Not recorded', aiSrc),
    F(33, `Prepared by: ${f.reported_by || '—'} · ${fmtDate(CLOCK.asOf)}\nReviewed by: Pending\nApproved by: Pending`, 'data'),
    F(34, 'Not recorded', 'data'),
    F(35, 'See Section 10 photos', 'data'),
    F(36, `${resulting}` + (f.shut_down ? ` · ${fmtDate(f.failure_at, true)} · Authorised by Head of Operations` : ''), 'user'),
    F(37, 'Not recorded – pending repair', 'data'),
  ];
  return {
    report_id: rid, asset_id: aid, failure_at: f.failure_at ?? null, shut_down: !!f.shut_down, trend, trend_indicators: trendIndicators(aid),
    inputs: f, fields, summary: ai.summary ?? null, warnings: validate(fields),
    tables: { readings: g.readings, trends: trendsFor(aid, f.failure_at, trend), cost: costTable(c), actions, whys, capa,
      parts: partsRows.map((p: any) => ({ part_id: p.part_id, name: p.name, qty: 1, cost_php: p.cost_php })), labour_php: c.labour, repair_php: c.repair },
    linked: { failure_event: g.failure_event, work_orders: g.work_orders, open_work_orders: g.open_work_orders, pm: g.pm, cost: c,
      repair_or_replace: pick(g.rr, ['recommendation', 'confidence', 'factors', 'costs']), standby: g.standby, spare: g.spare },
    llm_used: aiOn,
  };
}

/** Field 19: the production loss, and when the whole pair (so the plant) is down, its parts and the total with repair. */
export function costText(c: any): string {
  if (!c.pair_down || !c.loss) return c.repair ? `${c.explanation}\nTotal cost estimate (repair only): ${money(c.total)}` : c.explanation;
  return `${c.explanation}\nTotal incl. repair: ${money(c.total)} (breakdown below)`;
}
/** Full cost breakdown when both units of the pair are down (the plant stops or curtails): printed as its own table. */
export function costTable(c: any): any | null {
  if (!c.pair_down || !c.loss) return null;
  const l = c.loss;
  return {
    title: `Estimated cost of this shutdown – ${l.scenario_title || l.scenario || 'loss scenario'}`,
    note: `${fixed1(c.outage_h)} h outage · ${l.buffer_text} · ${fixed1(l.hours_beyond_buffer)} h beyond buffer` + (l.lines_curtailed?.length ? ` · lines curtailed: ${l.lines_curtailed.join(', ')}` : ''),
    rows: [['Lost revenue (lines stopped + restart time)', l.lost_revenue], ['Fines (RA 9275 exposure)', l.fine], ['Restart of curtailed lines', l.restart_cost],
      ['Overtime', l.overtime], ['Repair – labour', c.labour], ['Repair – parts', c.parts]],
    total: c.total,
  };
}
const fixed1 = (v: any) => Number(v || 0).toFixed(1);

function validate(fields: any[]): string[] {
  const w: string[] = [];
  const by: Record<number, any> = {};
  for (const f of fields) by[f.field_no] = f;
  for (const [no, allowed] of Object.entries(PICK)) {
    const v = strip(pyStr(by[+no].value).split(' ·')[0]);
    if (!allowed.includes(v)) w.push(`Field ${no} '${by[+no].field}': '${v}' not in allowed values`);
  }
  if (!/^IR-\d{4}-\d{3}$/.test(pyStr(by[1].value))) w.push('Field 1 Report ID format');
  for (const no of [7, 11]) if (['', 'Not recorded', null, undefined].includes(by[no].value)) w.push(`Field ${no} '${by[no].field}' is required`);
  return w;
}

export async function submit(env: Env, draft: any): Promise<{ rec: any; out: any }> {
  const rows = await loadSubmitted(env);
  const at = parseDt(draft.failure_at) ?? parseDt(CLOCK.asOf)!;
  let rid = draft.report_id;
  if (!rid || rows.some(r => r.report_id === rid) || D.incidentReports.some(r => r.report_id === rid)) rid = await nextReportId(env, yearOf(at), rows);
  for (const fld of draft.fields || []) if (fld.field_no === 1) fld.value = rid;
  const byNo: Record<string, any> = {};
  for (const x of draft.fields || []) byNo[String(x.field_no)] = x;
  delete draft.trend_indicators; // picker metadata, not part of the report
  const rec = { ...draft, report_id: rid, submitted_at: nowStr(), fields_by_no: byNo, ...(draft.trend ? { trend: trendOpts(draft.trend) } : {}) };
  await env.DB.prepare('INSERT INTO incidents (report_id, seq, rec) VALUES (?, ?, ?)').bind(rid, Date.now(), JSON.stringify(rec)).run();
  const out = { report_id: rid, shut_down: !!draft.shut_down, asset_id: draft.asset_id ?? null,
    status_change: draft.shut_down ? { asset_id: draft.asset_id ?? null, new_status: 'Shut Down', reason: `Shut down per incident report ${rid}` } : null };
  return { rec, out };
}

/** pdf.history_draft: map a historical record onto the 37 template fields so it prints on the same form. */
export function historyDraft(h: any, trend: TrendOpts | null = null): any {
  const a = D.asset[h.asset_id] || {};
  const sev = pyStr(h.severity || '');
  const dash = (s: string) => s.replace(/^[ –]+|[ –]+$/g, '');
  const vals: Record<number, any> = {
    1: h.report_id ?? null, 2: pyStr(h.incident_date || ''), 3: sev,
    5: dash(`${pyStr(h.asset_id)} – ${a.description ?? ''}`), 6: a.location_node || '',
    7: pyStr(h.incident_date || ''), 11: h.technician_inputs || 'Not recorded', 13: 'Not recorded',
    15: h.procedure_used || '', 16: 'Not recorded', 17: 'Not recorded',
    18: truthy(h.production_loss_php) ? 'Curtail' : 'None', 19: fmtComma(Number(h.production_loss_php || 0), 0),
    20: 'Not recorded', 21: 'None', 22: h.failure_mode || (sev === 'Near miss' ? 'Not applicable – near miss' : ''),
    23: 'Not recorded', 24: h.root_cause || '', 26: '', 27: h.corrective_action || '',
    30: h.repair_or_replace || '', 32: h.expected_report_text || '', 36: 'No change',
  };
  const fields = D.irTemplate.map(t => ({ field_no: t.field_no, section: t.section, field: t.field, value: t.field_no in vals ? vals[t.field_no] : 'Not recorded' }));
  return { report_id: h.report_id ?? null, asset_id: h.asset_id ?? null, failure_at: h.incident_date ?? null, fields, inputs: {}, linked: {},
    ...(trend ? { trend } : {}),
    tables: { repair_php: Number(h.repair_cost_php || 0), trends: h.asset_id && D.asset[h.asset_id] ? trendsFor(h.asset_id, h.incident_date, trend) : [],
      readings: h.asset_id && D.asset[h.asset_id] ? readingsFor(h.asset_id, parseDt(h.incident_date) ?? parseDt(CLOCK.asOf)!) : [] },
    summary: h.expected_report_text ?? null };
}

// --------------------------------------------------------------------------- Field 3 time range of stored reports
const trendKey = (id: string) => `ir_trend:${id}`;
/** Range + indicators saved for a historical report (they are read-only records, so the choice is kept in kv). */
export async function historyTrend(env: Env, id: string): Promise<TrendOpts | null> {
  const v = await env.DB.prepare('SELECT v FROM kv WHERE k = ?').bind(trendKey(id)).first<string>('v');
  return v ? trendOpts(JSON.parse(v)) : null;
}
/** Clock frame of a submitted report (the date shift on the day it was submitted). */
export function frameOf(rec: any): TrendFrame | undefined {
  const t = parseDt(rec?.submitted_at);
  return t === null ? undefined : { shiftMin: (Math.floor(t / DAY) - DATA_CUTOFF) * DAY, asOfMin: t };
}
/** Report → what its Field 3 charts are made from. */
export async function trendSource(env: Env, id: string) {
  const r = await getReport(env, id);
  if (!r) return null;
  if ('history' in r) {
    const h = r.history;
    return { report_id: id, source: 'history' as const, asset_id: h.asset_id as string, failure_at: h.incident_date as string, frame: undefined, trend: await historyTrend(env, id), rec: null };
  }
  return { report_id: id, source: 'submitted' as const, asset_id: r.asset_id as string, failure_at: r.failure_at as string, frame: frameOf(r), trend: r.trend ? trendOpts(r.trend) : null, rec: r };
}
/** Save the range + indicators with a report and re-chart it. Returns the saved options and the charts. */
export async function setReportTrend(env: Env, id: string, raw: any) {
  const src = await trendSource(env, id);
  if (!src) return null;
  const trend = src.asset_id && D.asset[src.asset_id] ? withDefaults(src.asset_id, trendOpts(raw)) : trendOpts(raw);
  const trends = src.asset_id && D.asset[src.asset_id] ? trendsFor(src.asset_id, src.failure_at, trend, src.frame) : [];
  if (src.rec) {
    const rec = { ...src.rec, trend, tables: { ...(src.rec.tables || {}), trends } };
    await env.DB.prepare('UPDATE incidents SET rec = ? WHERE report_id = ?').bind(JSON.stringify(rec), id).run();
  } else {
    await env.DB.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(trendKey(id), JSON.stringify(trend)).run();
  }
  return { trend, trends };
}

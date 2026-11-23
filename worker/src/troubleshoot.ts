/** Troubleshooter (port of backend troubleshoot.py): classify (retrieval + LLM) → yes/no decision tree → verbatim procedure. */
import { D, StatusCtx, failuresFor, getStatus, partnerOf, view } from './data';
import { completeJson } from './llm';
import { MANUAL_PAGES, getDoc, search } from './rag';
import { pyStr, strip } from './py';
import type { Env } from './env';

const PROC_RX = /\b([A-Z]{2}-\d{2})\b/g;

const CLASSIFY_SYSTEM = `You are Caster, GearCast's troubleshooting assistant. You classify a maintenance technician's description of a problem at a wastewater treatment plant
(pumps, motors, vibrating screens, check valves, sump and EQ tank levels) into exactly one symptom from the list.
Return JSON: {"behaviour": "answer"|"escalate"|"out_of_scope"|"no_match", "symptom_id": "SY-xx" or null,
"confidence": 0..1, "rationale": "<one sentence>", "likely_causes": ["<from the symptom's typical causes, most likely first>"],
"caster_says": "<one or two short, warm, plain sentences to the technician: what it sounds like and that you'll ask a few
yes/no checks. No emoji, no gushing.>"}
- "escalate": injury, burns, electric shock, fire spreading, structural damage (tank wall cracked, collapse), chemical
  exposure, anything life-safety → do not troubleshoot.
- "out_of_scope": not about WWTP equipment (sports, HR, IT, cooking, production lines unrelated to the WWTP...).
- "no_match": WWTP equipment but none of the symptoms fit.
- Prefer the most specific symptom: both units of a pair down → SY-16; trips on overload/thermal/breaker → SY-07;
  will not start / seized / standby failed to start → SY-06; earth leakage/ELCB/cable damage → SY-10;
  cavitation noise with fluctuating pressure → SY-11; leak at a transfer pump seal → SY-03; submersible seal alarm → SY-04.`;

function symptomCard(sid: string) {
  const s = D.symptoms[sid];
  return { id: sid, name: s.symptom, equipment_group: s.equipment_group, severity: s.severity,
    typical_causes: String(s.typical_causes).split(';').map(c => strip(c)), first_check: s.first_check,
    first_procedure: s.first_procedure, escalate_if: s.escalate_if };
}

export async function classify(env: Env, query: string, assetId: string | null) {
  const hits = await search(env, query + (assetId ? ` ${assetId}` : ''), { k: 5, source_types: ['symptom'] });
  const cands = hits.map(h => h.source_id);
  const catalog = Object.values<any>(D.symptoms).map(s => `${s.symptom_id}: ${s.symptom} | ${s.equipment_group} | ${D.symptomAliases[s.symptom_id] ?? ''}`).join('\n');
  let assetTxt = '';
  if (assetId && assetId in D.asset) { const a = D.asset[assetId]; assetTxt = `\nAsset selected: ${assetId} – ${a.asset_type} – ${a.description}`; }
  const user = `Symptoms:\n${catalog}\n\nRetrieval top candidates (hybrid search): ${cands.join(', ')}${assetTxt}\n\nTechnician says: "${query}"`;
  let out: any;
  try { out = await completeJson(env, CLASSIFY_SYSTEM, user, 900); } catch (e: any) {
    out = { behaviour: 'answer', symptom_id: cands.length ? cands[0] : null, confidence: 0.5, rationale: `Retrieval match (LLM unavailable: ${e?.kind || e?.name || 'Error'})` };
  }
  const beh = ['answer', 'escalate', 'out_of_scope', 'no_match'].includes(out.behaviour) ? out.behaviour : 'answer';
  let sid = out.symptom_id in D.symptoms ? out.symptom_id : null;
  if (beh === 'answer' && !sid) sid = cands.length ? cands[0] : null;
  return { behaviour: beh, symptom_id: beh === 'answer' ? sid : null, confidence: out.confidence ?? null, rationale: out.rationale ?? null,
    caster_says: out.caster_says ?? null, likely_causes: out.likely_causes || [], retrieval: hits.slice(0, 3) };
}

function rootQuestion(sid: string): string | null {
  const qs = Object.values<any>(D.questions).filter(q => q.symptom_id === sid);
  const referenced = new Set<string>();
  for (const q of qs) for (const t of [q.if_yes, q.if_no]) if (t in D.questions) referenced.add(t);
  const roots = qs.map(q => q.question_id).filter(id => !referenced.has(id)).sort();
  return roots.length ? roots[0] : qs.length ? qs[0].question_id : null;
}

export function procedurePayload(pid: string): any {
  const p = D.procedures[pid];
  if (!p) return null;
  const steps = (D.steps[pid] || []).map(s => ({ no: s.step_no, phase: s.phase, instruction: s.instruction, acceptance: s.acceptance_criteria ?? null,
    safety: s.safety_note ?? null, photo_required: !!s.photo_required, sign_off: !!s.sign_off_required }));
  const figs = (D.figures[pid] || []).map(f => ({ figure_id: f.figure_id, file_name: f.file_name, title: f.title, caption: f.caption ?? null, illustrative: !!f.illustrative }));
  return { id: pid, title: p.title, category: p.category, equipment: p.equipment, purpose: p.purpose,
    ppe: p.ppe, tools: p.tools, permits: p.permits, parts: p.parts ?? null, est_time_h: p.est_time_h ?? null,
    crew_size: p.crew_size ?? null, skills: p.skills ?? null, prerequisites: p.prerequisites ?? null,
    revision: p.revision ?? null, approval: p.approval ?? null,
    key_points: (D.keyPoints[pid] || []).map(k => ({ type: k.point_type, text: k.text })),
    steps, figures: figs, generated: false };
}

function sourcesFor(pid: string, sid: string | null) {
  const src: any[] = [{ kind: 'procedure', id: pid, label: `${pid} · ${D.procedures[pid].title} (GearCast data)` }];
  if (sid) src.push({ kind: 'symptom', id: sid, label: `${sid} · ${D.symptoms[sid].symptom} (symptom table)` });
  const pages = MANUAL_PAGES[pid] || [];
  if (pages.length) src.push({ kind: 'manual', id: 'MANUAL', pages, label: `WWTP Maintenance Manual p.${pages.slice(0, 3).join(', ')}` });
  return src;
}

function assetContext(ctx: StatusCtx, aid: string | null) {
  if (!aid || !(aid in D.asset)) return null;
  const v = view(ctx, aid);
  const p = partnerOf(aid);
  const pv = p ? view(ctx, p) : null;
  let advice: string | null = null;
  if (pv && v.role === 'DUTY' && pv.status === 'In Service') advice = `Start standby ${p} before isolating ${aid}.`;
  else if (pv && pv.status !== 'In Service') advice = `Partner ${p} is ${pv.status} – isolating ${aid} takes the pair down. Inform production / escalate (EM-09).`;
  return { asset_id: aid, status: v.status, role: v.role, partner: p, partner_status: p ? getStatus(ctx, p) : null, advice, history: historyFor(aid) };
}

/** Maintenance history the technician reviews before repairing (Mechanical Leadman story): recent failures with root
 *  cause, repair and lesson, plus the latest work orders. */
function historyFor(aid: string) {
  const failures = failuresFor(aid, false).slice(0, 5).map((f: any) => ({
    event_id: f.event_id, date: String(f.failure_at).slice(0, 10), symptom: f.symptom, failure_mode: f.failure_mode, root_cause: f.root_cause,
    repair_action: f.repair_action, parts: f.parts_summary ?? null, downtime_h: f.downtime_h ?? null, repair_cost_php: f.repair_cost_php ?? null,
  }));
  const work_orders = D.workOrders.filter((w: any) => w.asset_id === aid).sort((a: any, b: any) => (a.reported_at < b.reported_at ? 1 : -1)).slice(0, 5)
    .map((w: any) => ({ wo_id: w.wo_id, date: String(w.reported_at).slice(0, 10), type: w.wo_type, title: w.title, status: w.status }));
  return { failures, work_orders };
}

const STOP = new Set(['with', 'from', 'that', 'this', 'check', 'replace', 'pump', 'motor', 'unit', 'side', 'set', 'kit', 'and', 'the', 'for', 'verify', 'type']);
const words = (t: string) => new Set(String(t).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !STOP.has(w)).map(w => w.replace(/s$/, '')));

/** Materials likely needed for the repair: parts that fit the asset, ranked by overlap with the procedure / outcome /
 *  causes and by use in this asset's past failures with similar symptoms. Stock, location and supplier included. */
function materialsFor(aid: string | null, proc: any, outcome: string | null, causes: string[], symptom: string) {
  if (!aid || !(aid in D.asset)) return [];
  const want = words([proc?.title, outcome, ...causes, ...(proc?.steps || []).map((s: any) => s.instruction)].join(' '));
  const symW = words(symptom);
  const past = new Map<string, string>();
  for (const f of failuresFor(aid, false)) {
    const fw = words(`${f.symptom} ${f.failure_mode}`);
    if (![...fw].some(w => symW.has(w) || want.has(w))) continue;
    for (const m of String(f.parts_summary || '').matchAll(/(SPP-\d+)/g)) if (!past.has(m[1])) past.set(m[1], `${f.event_id} ${String(f.failure_at).slice(0, 10)}`);
  }
  const fits = D.spares.filter((p: any) => String(p.fits_assets ?? '').split(/;\s*/).includes(aid));
  return fits.map((p: any) => {
    const hit = [...words(p.part_name)].filter(w => want.has(w));
    const score = hit.length + (past.has(p.part_id) ? 2 : 0);
    return { p, score, why: [past.has(p.part_id) ? `used in ${past.get(p.part_id)}` : '', hit.length ? `matches ${hit.join(', ')}` : ''].filter(Boolean).join(' · ') };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 6).map(({ p, why }) => ({
    part_id: p.part_id, part_name: p.part_name, part_number: p.part_number ?? null, qty_on_hand: p.qty_on_hand, min_qty: p.min_qty, unit: p.unit,
    storage_location: p.storage_location ?? null, lead_time_days: p.lead_time_days ?? null, unit_cost_php: p.unit_cost_php ?? null,
    supplier: D.suppliers[p.supplier_id]?.supplier_name ?? null, in_stock: Number(p.qty_on_hand) > 0, why,
  }));
}

async function generatedFromUpload(env: Env, query: string, aid: string | null) {
  const hits = await search(env, query, { k: 5, source_types: ['upload'], asset_id: aid });
  if (!hits.length) return null;
  const docId = hits[0].source_id;
  const doc = (await getDoc(env, docId)) || { title: docId };
  const context = hits.map(h => `[p.${pyStr(h.page)}] ${h.text}`).join('\n---\n');
  const out = await completeJson(env,
    'You write a short step-by-step maintenance job for a technician from the manual excerpts given. Use only facts in ' +
    'the excerpts. JSON: {"title": str, "ppe": str, "tools": str, "steps": [{"phase": str, "instruction": str, ' +
    '"acceptance": str|null, "safety": str|null, "page": int|null}], "escalate_if": str|null}. Max 10 steps.',
    `Problem: ${query}\n\nManual excerpts from '${doc.title}':\n${context}`, 1800);
  const steps = (out.steps || []).map((s: any, i: number) => ({ no: i + 1, phase: s.phase || 'Work', instruction: s.instruction ?? '', acceptance: s.acceptance ?? null,
    safety: s.safety ?? null, photo_required: false, sign_off: false, page: s.page ?? null }));
  return { stage: 'procedure', symptom: null, path: [], outcome: null,
    procedure: { id: docId, title: out.title || `Job from ${doc.title}`, ppe: out.ppe ?? null, tools: out.tools ?? null, permits: 'Per plant rules', est_time_h: null,
      steps, figures: [], key_points: [], generated: true, generated_note: `Generated from ${doc.title} — verify against the manual before use.` },
    escalate_if: out.escalate_if ?? null,
    sources: hits.slice(0, 3).map(h => ({ kind: 'upload', id: docId, label: `${doc.title} p.${pyStr(h.page)}` })) };
}

function buildPlan(sid: string | null, path: any[], cq: any, proc: any): any[] {
  const plan: any[] = [];
  if (sid) plan.push({ id: 'symptom', kind: 'symptom', title: `Identify symptom: ${D.symptoms[sid].symptom}`, detail: sid, auto: true, done: true });
  for (const p of path) plan.push({ id: `q:${p.question_id}`, kind: 'question', title: p.question, detail: p.question_id, auto: true, done: true, answer: p.answer });
  if (cq) plan.push({ id: `q:${cq.id}`, kind: 'question', title: cq.text, detail: cq.id, auto: true, done: false });
  if (proc) {
    const safety = proc.steps.filter((s: any) => s.safety).map((s: any) => s.safety);
    plan.push({ id: 'safety', kind: 'safety', title: 'Safety, LOTO and permits',
      detail: [`Permits: ${proc.permits || 'per plant rules'}`, ...safety.slice(0, 2)].join('; '), auto: false, done: false });
    plan.push({ id: 'prep', kind: 'prep', title: 'Tools and PPE ready', detail: `Tools: ${proc.tools || '—'} · PPE: ${proc.ppe || '—'}`, auto: false, done: false });
    for (const st of proc.steps) plan.push({ id: `step:${proc.id}:${st.no}`, kind: 'step', title: st.instruction, detail: st.phase ?? null,
      no: st.no, photo_required: st.photo_required ?? null, sign_off: st.sign_off ?? null, auto: false, done: false });
    const accept = proc.steps.filter((s: any) => s.acceptance).map((s: any) => s.acceptance);
    plan.push({ id: 'check', kind: 'check', title: 'Acceptance check', detail: accept.length ? accept[accept.length - 1] : 'Unit runs normally; readings within limits', auto: false, done: false });
    plan.push({ id: 'rts', kind: 'rts', title: 'Return to service and log result',
      detail: 'OP-05 run test; update status; file the incident report if the unit was taken out of service', auto: false, done: false });
  }
  return plan;
}

export async function troubleshoot(env: Env, query: string, assetId: string | null, answers: any[], symptomId: string | null, sim: any, skipQuestions = false): Promise<any> {
  const ctx = StatusCtx.fromClient(sim);
  const aid = (assetId || '').toUpperCase() || null;
  let cls: any = null;
  if (!symptomId) {
    cls = await classify(env, query, aid);
    if (cls.behaviour === 'escalate') return { stage: 'escalate', classification: cls,
      message: 'Stop. This is a safety emergency – call the shift supervisor / emergency response and follow the plant safety procedure. Do not attempt repairs.' };
    if (cls.behaviour === 'out_of_scope') return { stage: 'out_of_scope', classification: cls,
      message: 'This is outside the WWTP pumps, motors and screens GearCast covers. Please contact the right department.' };
    if (cls.behaviour === 'no_match' || (aid && !(aid in D.asset))) {
      const gen = await generatedFromUpload(env, query, aid);
      if (gen) return { ...gen, classification: cls, asset: assetContext(ctx, aid), plan: buildPlan(null, [], null, gen.procedure) };
      if (cls.behaviour === 'no_match') return { stage: 'no_match', classification: cls,
        message: 'No matching symptom in the troubleshooting table. Try describing what you see, hear or measure, or upload the equipment manual.' };
    }
    symptomId = cls.symptom_id;
  }
  if (!symptomId || !(symptomId in D.symptoms)) return { stage: 'no_match', message: `Unknown symptom ${pyStr(symptomId)}` };
  const sidv: string = symptomId;

  const amap = new Map<string, boolean>();
  for (const a of answers || []) amap.set(a.question_id, ['yes', 'y', 'true', '1'].includes(pyStr(a.answer).toLowerCase()));
  const path: any[] = [];
  let outcome: string | null = null;
  let qid: string | null = skipQuestions ? null : rootQuestion(sidv);
  let guard = 0;
  while (qid && guard < 12) {
    guard++;
    const q = D.questions[qid];
    if (!amap.has(qid)) {
      const cq = { id: qid, text: q.question, step: path.length + 1 };
      return { stage: 'question', symptom: symptomCard(sidv), classification: cls, path, question: cq, asset: assetContext(ctx, aid), plan: buildPlan(sidv, path, cq, null) };
    }
    const ans = amap.get(qid)!;
    const nxt = ans ? q.if_yes : q.if_no;
    path.push({ question_id: qid, question: q.question, answer: ans ? 'Yes' : 'No', next: nxt });
    if (nxt in D.questions) qid = nxt;
    else { outcome = String(nxt).replace(/^Action:\s*/, ''); qid = null; }
  }
  const sym = D.symptoms[sidv];
  const procs = [...(outcome || '').matchAll(PROC_RX)].map(m => m[1]);
  const pid: string = procs.find(p => p in D.procedures) ?? sym.first_procedure;
  const proc = procedurePayload(pid);
  const related = [...new Set([...procs, sym.first_procedure])].filter(p => p in D.procedures && p !== pid);
  return {
    stage: 'procedure', symptom: symptomCard(sidv), classification: cls, path,
    outcome: outcome || `Follow ${pid} (${D.procedures[pid].title})`,
    why: path.length ? `${path.map(p => `${p.question_id} ${p.answer}`).join(' → ')} → ${pyStr(outcome)}` : `First procedure for ${sidv}`,
    likely_causes: ((cls || {}).likely_causes && (cls || {}).likely_causes.length ? cls.likely_causes : null) || symptomCard(sidv).typical_causes,
    procedure: proc, related_procedures: related.map(r => ({ id: r, title: D.procedures[r].title })),
    escalate_if: sym.escalate_if, sources: sourcesFor(pid, sidv), asset: assetContext(ctx, aid),
    materials: materialsFor(aid, proc, outcome, symptomCard(sidv).typical_causes || [], sym.symptom),
    plan: buildPlan(sidv, path, null, proc),
  };
}

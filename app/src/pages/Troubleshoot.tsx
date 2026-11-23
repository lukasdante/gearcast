import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PLANT } from '../data';
import { postJSON, simPayload, streamSSE } from '../api/client';
import { Markdown } from '../shell/Markdown';
import { Icon } from '../shell/icons';
import { Caster } from '../shell/Caster';
import { useIntent } from '../store/intentStore';
import { navigate } from '../store/route';
import '../styles/pages.css';

interface PlanItem {
  id: string; kind: 'symptom' | 'question' | 'safety' | 'prep' | 'step' | 'check' | 'rts'; title: string; detail?: string;
  auto: boolean; done: boolean; answer?: string; no?: number; photo_required?: boolean; sign_off?: boolean;
}
interface Step { no: number; phase: string; instruction: string; acceptance?: string | null; safety?: string | null; photo_required: boolean; sign_off: boolean; page?: number }
interface Procedure {
  id: string; title: string; category?: string; equipment?: string; purpose?: string; ppe?: string; tools?: string; permits?: string;
  parts?: string; est_time_h?: number | null; crew_size?: number; skills?: string; prerequisites?: string; revision?: string; approval?: string;
  key_points: { type: string; text: string }[]; steps: Step[]; figures: { figure_id: string; file_name: string; title: string; caption?: string; illustrative?: boolean }[];
  generated: boolean; generated_note?: string;
}
interface Resp {
  stage: 'question' | 'procedure' | 'escalate' | 'out_of_scope' | 'no_match';
  message?: string;
  classification?: { behaviour: string; symptom_id?: string; rationale?: string; caster_says?: string; confidence?: number; likely_causes?: string[] } | null;
  symptom?: { id: string; name: string; equipment_group: string; severity: string; typical_causes: string[]; first_check: string; first_procedure: string; escalate_if: string } | null;
  path?: { question_id: string; question: string; answer: string; next: string }[];
  question?: { id: string; text: string; step: number };
  outcome?: string; why?: string; likely_causes?: string[]; procedure?: Procedure; related_procedures?: { id: string; title: string }[];
  escalate_if?: string; sources?: { kind: string; id: string; label: string }[];
  asset?: { asset_id: string; status: string; role: string; partner?: string; partner_status?: string; advice?: string; history?: History } | null;
  materials?: Material[];
  plan?: PlanItem[];
}
interface History {
  failures: { event_id: string; date: string; symptom: string; failure_mode: string; root_cause: string; repair_action: string; parts: string | null; downtime_h: number | null; repair_cost_php: number | null }[];
  work_orders: { wo_id: string; date: string; type: string; title: string; status: string }[];
}
interface Material { part_id: string; part_name: string; part_number: string | null; qty_on_hand: number; min_qty: number; unit: string; storage_location: string | null; lead_time_days: number | null; supplier: string | null; in_stock: boolean; why: string }

/** Maintenance history of the asset (reviewed before the repair). */
function HistoryCard({ h, assetId }: { h: History; assetId: string }) {
  const [all, setAll] = useState(false);
  if (!h.failures.length && !h.work_orders.length) return null;
  const fs = all ? h.failures : h.failures.slice(0, 3);
  return (
    <details className="card ts-history" open>
      <summary><b>Maintenance history · {assetId}</b> <span className="muted small">{h.failures.length} recent failures · {h.work_orders.length} work orders</span></summary>
      {fs.map(f => (
        <div key={f.event_id} className="ts-hist-row small">
          <div><span className="mono muted">{f.date} · {f.event_id}</span> <b>{f.failure_mode}</b> <span className="muted">— {f.symptom}</span></div>
          <div className="muted">Cause: {f.root_cause}. Repair: {f.repair_action}{f.parts ? ` (${f.parts})` : ''}{f.downtime_h != null ? ` · ${f.downtime_h} h down` : ''}</div>
        </div>
      ))}
      {h.failures.length > 3 && <button type="button" className="btn ghost sm" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${h.failures.length}`}</button>}
      {!!h.work_orders.length && <div className="ts-wos small">{h.work_orders.map(w => <span key={w.wo_id} className="tag-pill"><span className="mono">{w.wo_id}</span> {w.date} · {w.type} · {w.status}</span>)}</div>}
    </details>
  );
}

/** Materials needed for the repair (parts that fit, with stock, location and supplier). */
function MaterialsCard({ items }: { items: Material[] }) {
  if (!items.length) return null;
  return (
    <div className="card ts-materials">
      <b>Materials needed</b> <span className="muted small">parts that fit this unit, matched to the job and past repairs</span>
      <table className="tbl compact">
        <thead><tr><th>Part</th><th className="num">Stock</th><th>Location</th><th>Supplier · lead</th></tr></thead>
        <tbody>{items.map(m => (
          <tr key={m.part_id}>
            <td><span className="mono muted">{m.part_id}</span> {m.part_name}{m.why && <div className="muted small">{m.why}</div>}</td>
            <td className={`num mono${!m.in_stock ? ' bad-t' : m.qty_on_hand < m.min_qty ? ' warn-t' : ''}`}>{m.qty_on_hand} {m.unit}{!m.in_stock && <div className="small">order</div>}</td>
            <td className="small">{m.storage_location ?? '—'}</td>
            <td className="small">{m.supplier ?? '—'}{m.lead_time_days != null ? ` · ${m.lead_time_days} d` : ''}</td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}
interface ChatMsg { role: 'user' | 'assistant'; content: string }
interface Session { id: string; query: string; asset_id: string; answers: { question_id: string; answer: string }[]; first: Resp | null; resp: Resp | null; started: string; chat?: ChatMsg[] }

const SKEY = 'gearcast.troubleshoot.session.v1';
const PKEY = (id: string) => `gearcast.troubleshoot.plan.${id}`;
const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

const ASSETS = PLANT.equipment.map(a => a.asset_id);
const EXAMPLES = ['pump making grinding noise and low flow', 'seal dripping more than usual', 'screen mesh full of fat', 'motor overload trip keeps happening'];

export function Troubleshoot() {
  const [query, setQuery] = useState('');
  const [assetId, setAssetId] = useState('');
  const [session, setSession] = useState<Session | null>(() => load<Session | null>(SKEY, null));
  const [checks, setChecks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const intent = useIntent(s => s.troubleshoot);

  useEffect(() => { if (session) save(SKEY, session); }, [session]);
  useEffect(() => { setChecks(session ? load(PKEY(session.id), {}) : {}); }, [session?.id]);
  useEffect(() => { if (session) save(PKEY(session.id), checks); }, [checks, session?.id]);

  const call = async (s: Session, extra: Record<string, unknown> = {}) => {
    setLoading(true); setErr(null);
    try {
      const symptom_id = s.first?.symptom?.id ?? s.first?.classification?.symptom_id;
      const resp = await postJSON<Resp>('/api/troubleshoot', {
        query: s.query, asset_id: s.asset_id || null, answers: s.answers, symptom_id: s.first ? symptom_id : undefined, sim: simPayload(), ...extra,
      });
      setSession({ ...s, first: s.first ?? resp, resp });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed');
    } finally { setLoading(false); }
  };

  const start = (q = query, a = assetId) => {
    if (!q.trim()) return;
    const s: Session = { id: Date.now().toString(36), query: q.trim(), asset_id: a, answers: [], first: null, resp: null, started: new Date().toISOString() };
    setSession(s); setChecks({});
    call(s);
  };

  useEffect(() => {
    if (!intent) return;
    setQuery(intent.query); setAssetId(intent.asset_id ?? '');
    useIntent.getState().clear('troubleshoot');
    if (intent.query) start(intent.query, intent.asset_id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent?.seq]);

  const answer = (qid: string, yes: boolean) => {
    if (!session) return;
    const s = { ...session, answers: [...session.answers, { question_id: qid, answer: yes ? 'yes' : 'no' }] };
    setSession(s); call(s);
  };
  const back = () => {
    if (!session?.answers.length) return;
    const s = { ...session, answers: session.answers.slice(0, -1) };
    setSession(s); call(s);
  };
  const reset = () => { setSession(null); setChecks({}); try { localStorage.removeItem(SKEY); } catch { /* */ } };

  const resp = session?.resp;
  const first = session?.first;
  const plan = resp?.plan ?? [];
  const isDone = (it: PlanItem) => it.done || !!checks[it.id];
  const toggle = (id: string) => setChecks(c => { const n = { ...c }; if (n[id]) delete n[id]; else n[id] = new Date().toISOString(); return n; });
  const doneCount = plan.filter(isDone).length;
  const current = plan.find(it => !isDone(it))?.id;
  const proc = resp?.stage === 'procedure' ? resp.procedure : undefined;
  const stepCheckId = (no: number) => `step:${proc?.id}:${no}`;
  const writeIncident = () => {
    if (!session) return;
    const sym = first?.symptom;
    const qa = (resp?.path ?? []).map(p => `${p.question} ${p.answer}`).join('; ');
    const doneSteps = plan.filter(it => it.kind === 'step' && isDone(it)).map(it => `step ${it.no}`).join(', ');
    useIntent.getState().setIncident(session.asset_id || resp?.asset?.asset_id || 'P-101B', {
      observed: [session.query, sym ? `Symptom ${sym.id} ${sym.name}.` : '', qa ? `Checks: ${qa}.` : ''].filter(Boolean).join(' '),
      procedure_used: proc?.id ?? '',
      parts_used: proc?.parts ?? '',
      operating_condition: 'Running',
      detected_by: /nois|grind|knock|rattl|vibrat/i.test(session.query) ? 'Noise' : /leak|drip|seep/i.test(session.query) ? 'Leak observed'
        : /flow|level/i.test(session.query) ? 'Flow drop' : /trip|overload/i.test(session.query) ? 'Trip' : 'Inspection',
      actions_taken: doneSteps ? `Troubleshooting per ${proc?.id ?? 'procedure'}: completed ${doneSteps}.` : '',
    });
    navigate('incidents');
  };

  return (
    <div className="page ts-page">
      <div className="ts-main">
        <header className="page-head no-print">
          <h1>Troubleshoot</h1>
          <p>Describe what you see, hear or measure. Caster finds the symptom, asks a few yes/no checks and opens the right procedure.</p>
        </header>

        <form className="ts-search card no-print" onSubmit={e => { e.preventDefault(); start(); }}>
          <Icon name="wrench" size={18} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="e.g. pump making grinding noise and low flow" aria-label="Describe the problem" />
          <select value={assetId} onChange={e => setAssetId(e.target.value)} aria-label="Asset">
            <option value="">Any asset</option>
            {ASSETS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button type="submit" className="btn primary" disabled={loading || !query.trim()}>{loading && !resp ? 'Thinking…' : 'Troubleshoot'}</button>
        </form>
        {!session && (
          <div className="ts-examples no-print">
            <span className="muted small">Try:</span>
            {EXAMPLES.map(x => <button key={x} type="button" className="suggest" onClick={() => { setQuery(x); start(x, assetId); }}>{x}</button>)}
          </div>
        )}
        {err && <div className="alert-box bad">{err}</div>}

        {session && (
          <div className="ts-convo">
            <div className="bubble me">{session.query}{session.asset_id && <span className="mono tag-pill">{session.asset_id}</span>}</div>

            {loading && !resp && <CasterLine state="thinking">Reading the symptom table and manuals…</CasterLine>}

            {resp && (resp.stage === 'escalate' || resp.stage === 'out_of_scope' || resp.stage === 'no_match') && (
              <CasterLine><div className={`alert-box ${resp.stage === 'escalate' ? 'bad' : ''}`}>{resp.message}</div></CasterLine>
            )}

            {first?.symptom && (
              <CasterLine>
                {first.classification?.caster_says && <p className="caster-says">{first.classification.caster_says}</p>}
                <div className="card symptom-card">
                  <div className="sym-head">
                    <span className="mono sym-id">{first.symptom.id}</span>
                    <b>{first.symptom.name}</b>
                    <span className={`sev sev-${first.symptom.severity.toLowerCase()}`}>{first.symptom.severity}</span>
                  </div>
                  {first.classification?.rationale && <p className="muted">{first.classification.rationale}</p>}
                  <div className="kv2">
                    <span>Likely causes</span><span>{(first.classification?.likely_causes?.length ? first.classification.likely_causes : first.symptom.typical_causes).join(' · ')}</span>
                    <span>First check</span><span>{first.symptom.first_check}</span>
                    <span>Equipment</span><span>{first.symptom.equipment_group}</span>
                  </div>
                </div>
                {resp?.asset?.advice && <div className="alert-box info"><Icon name="swap" size={14} /> {resp.asset.advice}</div>}
                {resp?.asset?.history && <HistoryCard h={resp.asset.history} assetId={resp.asset.asset_id} />}
              </CasterLine>
            )}

            {resp?.path?.map(p => (
              <div key={p.question_id} className="qa-done">
                <span className="mono muted">{p.question_id}</span> {p.question} <b className={p.answer === 'Yes' ? 'ans-yes' : 'ans-no'}>{p.answer}</b>
              </div>
            ))}

            {resp?.stage === 'question' && resp.question && (
              <CasterLine state={loading ? 'thinking' : 'idle'}>
                <div className="card question-card">
                  <div className="small muted">Check {resp.question.step} · <span className="mono">{resp.question.id}</span></div>
                  <p className="q-text">{resp.question.text}</p>
                  <div className="q-actions">
                    <button type="button" className="btn primary" disabled={loading} onClick={() => answer(resp.question!.id, true)}>Yes</button>
                    <button type="button" className="btn" disabled={loading} onClick={() => answer(resp.question!.id, false)}>No</button>
                    {!!session.answers.length && <button type="button" className="btn ghost" disabled={loading} onClick={back}>Back</button>}
                    <button type="button" className="btn ghost skip" disabled={loading} onClick={() => call(session, { skip_questions: true })}>Skip to procedure</button>
                  </div>
                </div>
              </CasterLine>
            )}

            {proc && resp && (
              <CasterLine>
                <p className="caster-says">{proc.generated ? 'No structured procedure for this one, so I drafted steps from the uploaded manual. Please verify.' : <>Here's the job: <b>{resp.outcome}</b>.</>}</p>
                {resp.why && <p className="small muted why">Path: {resp.why}</p>}
                {!!resp.materials?.length && <MaterialsCard items={resp.materials} />}
                <ProcedureView proc={proc} checks={checks} toggle={toggle} stepCheckId={stepCheckId} />
                {resp.escalate_if && <div className="alert-box bad"><b>Escalate if:</b> {resp.escalate_if}</div>}
                {!!resp.related_procedures?.length && (
                  <p className="small muted">Related: {resp.related_procedures.map(r => <span key={r.id} className="mono tag-pill">{r.id} {r.title}</span>)}</p>
                )}
                {!!resp.sources?.length && (
                  <div className="sources"><span className="muted small">Sources</span>{resp.sources.map(s => <span key={s.id + s.label} className="source"><Icon name="file" size={12} />{s.label}</span>)}</div>
                )}
                <div className="q-actions no-print">
                  {session.asset_id && <button type="button" className="btn" onClick={() => { useIntent.getState().setIncident(session.asset_id); navigate('incidents'); }}><Icon name="incidents" size={14} />Draft incident report</button>}
                  {!!session.answers.length && <button type="button" className="btn ghost" onClick={back}>Back one check</button>}
                </div>
              </CasterLine>
            )}
          </div>
        )}
        {session && <AskCaster session={session} setSession={setSession} plan={plan} isDone={isDone} />}
      </div>

      {session && <JobSheet session={session} plan={plan} isDone={isDone} checks={checks} />}
      {session && plan.length > 0 && (
        <aside className="plan card">
          <div className="plan-head">
            <div><b>Plan</b> <span className="muted small">{doneCount} / {plan.length} done</span></div>
            <div className="plan-btns no-print">
              <button type="button" className="btn ghost sm" onClick={() => setChecks({})}>Reset plan</button>
              <button type="button" className="btn sm" onClick={() => window.print()}><Icon name="print" size={13} />Print job sheet</button>
              <button type="button" className="btn sm primary" onClick={writeIncident}><Icon name="incidents" size={13} />Write incident report</button>
            </div>
          </div>
          <div className="progress"><i style={{ width: `${(doneCount / plan.length) * 100}%` }} /></div>
          <ol className="plan-list">
            {plan.map(it => {
              const done = isDone(it);
              return (
                <li key={it.id} className={`plan-item k-${it.kind}${done ? ' done' : ''}${current === it.id ? ' current' : ''}`}>
                  <button type="button" className="pbox" disabled={it.auto} onClick={() => toggle(it.id)} aria-label={done ? 'Mark not done' : 'Mark done'}>
                    {done && <Icon name="check" size={12} stroke={2.4} />}
                  </button>
                  <div className="pi-text">
                    <div className="pi-title">
                      {it.kind === 'step' && <span className="mono pi-no">{it.no}</span>}
                      {it.kind === 'question' && <span className="mono pi-no">?</span>}
                      <span>{it.title}</span>
                    </div>
                    <div className="pi-meta">
                      {it.answer && <span className={it.answer === 'Yes' ? 'ans-yes' : 'ans-no'}>{it.answer}</span>}
                      {it.detail && it.kind !== 'step' && <span className="muted">{it.detail}</span>}
                      {it.kind === 'step' && it.detail && <span className="muted">{it.detail}</span>}
                      {it.sign_off && <span className="badge">sign-off</span>}
                      {it.photo_required && <span className="badge">photo</span>}
                      {checks[it.id] && <span className="muted mono">✓ {hhmm(checks[it.id])}</span>}
                      {it.auto && done && <span className="muted">auto</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <button type="button" className="btn ghost sm no-print plan-new" onClick={reset}>New troubleshooting session</button>
        </aside>
      )}
    </div>
  );
}

function CasterLine({ children, state = 'idle' }: { children: ReactNode; state?: 'idle' | 'thinking' | 'talking' }) {
  return (
    <div className="caster-line">
      <Caster size={30} state={state} className="no-print" />
      <div className="caster-line-body">{children}</div>
    </div>
  );
}

function ProcedureView({ proc, checks, toggle, stepCheckId }: { proc: Procedure; checks: Record<string, string>; toggle: (id: string) => void; stepCheckId: (n: number) => string }) {
  const phases = useMemo(() => {
    const out: { phase: string; steps: Step[] }[] = [];
    for (const s of proc.steps) {
      const last = out[out.length - 1];
      if (last && last.phase === s.phase) last.steps.push(s); else out.push({ phase: s.phase, steps: [s] });
    }
    return out;
  }, [proc]);
  return (
    <div className="card proc">
      <div className="proc-head">
        <span className="mono sym-id">{proc.id}</span>
        <h2>{proc.title}</h2>
        {proc.generated && <span className="badge warn">AI-generated · verify</span>}
      </div>
      {proc.generated_note && <div className="alert-box warn">{proc.generated_note}</div>}
      {proc.purpose && <p className="muted">{proc.purpose}</p>}
      <div className="proc-meta">
        <div><span>PPE</span>{proc.ppe || '—'}</div>
        <div><span>Tools</span>{proc.tools || '—'}</div>
        <div><span>Permits</span>{proc.permits || '—'}</div>
        <div><span>Time · crew</span>{proc.est_time_h != null ? `${proc.est_time_h} h` : '—'}{proc.crew_size ? ` · ${proc.crew_size} people` : ''}</div>
        {proc.parts && <div><span>Parts</span>{proc.parts}</div>}
        {proc.prerequisites && <div><span>Before starting</span>{proc.prerequisites}</div>}
      </div>
      {!!proc.key_points.length && (
        <div className="keypoints">
          {proc.key_points.map((k, i) => <div key={i} className={`kp kp-${k.type.toLowerCase()}`}><b>{k.type}</b> {k.text}</div>)}
        </div>
      )}
      {phases.map(ph => (
        <div key={ph.phase} className="phase">
          <div className="phase-name">{ph.phase}</div>
          {ph.steps.map(s => {
            const id = stepCheckId(s.no);
            return (
              <div key={s.no} className={`step${checks[id] ? ' done' : ''}`}>
                <button type="button" className="pbox" onClick={() => toggle(id)} aria-label={`Step ${s.no} done`}>{checks[id] && <Icon name="check" size={12} stroke={2.4} />}</button>
                <span className="mono step-no">{s.no}</span>
                <div className="step-body">
                  <div>{s.instruction}</div>
                  {s.acceptance && <div className="step-acc"><span>Accept</span>{s.acceptance}</div>}
                  {s.safety && <div className="step-safety"><Icon name="incidents" size={13} />{s.safety}</div>}
                  <div className="step-badges">
                    {s.sign_off && <span className="badge">sign-off</span>}
                    {s.photo_required && <span className="badge">photo</span>}
                    {s.page && <span className="badge">p.{s.page}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {!!proc.figures.length && (
        <div className="figs">
          {proc.figures.map(f => (
            <figure key={f.figure_id}>
              <img src={`/figures/${f.file_name}`} alt={f.title} loading="lazy" />
              <figcaption><b className="mono">{f.figure_id}</b> {f.title}{f.caption ? ` — ${f.caption}` : ''}{f.illustrative ? ' (illustrative)' : ''}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {proc.revision && <p className="small muted">{proc.revision} · {proc.approval ?? ''}</p>}
    </div>
  );
}

const STARTERS = ['Why this procedure?', 'What torque or clearance should I check?', 'Can I keep running until the end of shift?'];

/** Free-form follow-up questions to Caster at any point of the troubleshooting session. */
function AskCaster({ session, setSession, plan, isDone }: {
  session: Session; setSession: (s: Session) => void; plan: PlanItem[]; isDone: (it: PlanItem) => boolean;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const chat = session.chat ?? [];
  const context = () => {
    const r = session.resp, sym = session.first?.symptom;
    const cur = plan.find(it => !isDone(it));
    return [
      'Troubleshooting context (from the GearCast Troubleshoot page):',
      `Problem: ${session.query}`, `Asset: ${session.asset_id || 'not specified'}`,
      sym ? `Symptom: ${sym.id} ${sym.name}` : '',
      r?.path?.length ? `Checks answered: ${r.path.map(p => `${p.question_id} ${p.answer}`).join(', ')}` : '',
      r?.procedure ? `Procedure: ${r.procedure.id} ${r.procedure.title}` : r?.question ? `Pending check: ${r.question.text}` : '',
      `Plan progress: ${plan.filter(isDone).length}/${plan.length}${cur ? `; current item: ${cur.title}` : ''}`,
      'Answer the technician\'s question below in that context.',
    ].filter(Boolean).join('\n');
  };
  const send = async (q = text) => {
    if (!q.trim() || busy) return;
    const next: ChatMsg[] = [...chat, { role: 'user', content: q.trim() }, { role: 'assistant', content: '' }];
    let cur = { ...session, chat: next };
    setSession(cur); setText(''); setBusy(true);
    const msgs = next.slice(0, -1).map((m, i) => i === 0 ? { ...m, content: `${context()}\n\nQuestion: ${m.content}` } : m);
    try {
      await streamSSE('/api/chat', { messages: msgs, sim: simPayload() }, e => {
        if (e.type === 'delta' || e.type === 'reset_text' || e.type === 'error') {
          const last = cur.chat![cur.chat!.length - 1];
          const content = e.type === 'delta' ? last.content + e.text : e.type === 'error' ? `_${e.message}_` : '';
          cur = { ...cur, chat: [...cur.chat!.slice(0, -1), { ...last, content }] };
          setSession(cur);
        }
      });
    } catch (err) {
      const last = cur.chat![cur.chat!.length - 1];
      cur = { ...cur, chat: [...cur.chat!.slice(0, -1), { ...last, content: `_${err instanceof Error ? err.message : 'Request failed'}_` }] };
      setSession(cur);
    } finally { setBusy(false); }
  };
  return (
    <div className="ts-ask no-print">
      {chat.map((m, i) => m.role === 'user'
        ? <div key={i} className="bubble me">{m.content}</div>
        : <CasterLine key={i} state={busy && i === chat.length - 1 ? (m.content ? 'talking' : 'thinking') : 'idle'}>
            {m.content ? <div className="md"><Markdown text={m.content} /></div> : <span className="muted">Thinking…</span>}
          </CasterLine>)}
      {!chat.length && (
        <div className="ts-examples"><span className="muted small">Ask Caster anytime:</span>
          {STARTERS.map(x => <button key={x} type="button" className="suggest" onClick={() => send(x)}>{x}</button>)}
        </div>
      )}
      <form className="ts-ask-box card" onSubmit={e => { e.preventDefault(); send(); }}>
        <Caster size={22} state={busy ? 'thinking' : 'idle'} />
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Ask Caster about this job…" aria-label="Ask Caster" />
        <button type="submit" className="btn primary sm" disabled={busy || !text.trim()}>Ask</button>
      </form>
    </div>
  );
}

/** Print-only A4 job sheet (replaces the screen layout when printing). */
function JobSheet({ session, plan, isDone, checks }: { session: Session; plan: PlanItem[]; isDone: (it: PlanItem) => boolean; checks: Record<string, string> }) {
  const r = session.resp, sym = session.first?.symptom, p = r?.stage === 'procedure' ? r.procedure : undefined;
  const now = new Date();
  const jobNo = `JS-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${session.id.slice(-4).toUpperCase()}`;
  const stepDone = (no: number) => !!checks[`step:${p?.id}:${no}`];
  const prep = plan.filter(it => it.kind === 'safety' || it.kind === 'prep' || it.kind === 'check' || it.kind === 'rts');
  const Box = ({ on }: { on?: boolean }) => <span className={`js-box${on ? ' on' : ''}`}>{on ? '✓' : ''}</span>;
  return (
    <section className="jobsheet print-only">
      <header className="js-head">
        <div><div className="js-brand">GearCast</div><div className="js-plant">Franklin Baker – Darong WWTP · Maintenance</div></div>
        <div className="js-title">JOB SHEET</div>
        <table className="js-meta"><tbody>
          <tr><th>Job no.</th><td>{jobNo}</td></tr>
          <tr><th>Printed</th><td>{now.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td></tr>
          <tr><th>Asset</th><td>{session.asset_id || r?.asset?.asset_id || '—'}</td></tr>
        </tbody></table>
      </header>

      <h3>1 · Problem and diagnosis</h3>
      <table className="js-grid"><tbody>
        <tr><th>Problem reported</th><td colSpan={3}>{session.query}</td></tr>
        <tr><th>Symptom</th><td>{sym ? `${sym.id} · ${sym.name}` : '—'}</td><th>Severity</th><td>{sym?.severity ?? '—'}</td></tr>
        <tr><th>Likely causes</th><td colSpan={3}>{sym?.typical_causes.join('; ') ?? '—'}</td></tr>
        {r?.asset?.advice && <tr><th>Standby</th><td colSpan={3}>{r.asset.advice}</td></tr>}
      </tbody></table>
      {!!r?.path?.length && (
        <table className="js-table"><thead><tr><th style={{ width: '12%' }}>Check</th><th>Question</th><th style={{ width: '10%' }}>Answer</th></tr></thead>
          <tbody>{r.path.map(q => <tr key={q.question_id}><td>{q.question_id}</td><td>{q.question}</td><td><b>{q.answer}</b></td></tr>)}</tbody></table>
      )}

      {p && <>
        <h3>2 · Procedure {p.id} — {p.title}</h3>
        <table className="js-grid"><tbody>
          <tr><th>Permits</th><td>{p.permits || '—'}</td><th>Time · crew</th><td>{p.est_time_h != null ? `${p.est_time_h} h` : '—'}{p.crew_size ? ` · ${p.crew_size}` : ''}</td></tr>
          <tr><th>PPE</th><td colSpan={3}>{p.ppe || '—'}</td></tr>
          <tr><th>Tools</th><td colSpan={3}>{p.tools || '—'}</td></tr>
          {p.parts && <tr><th>Parts</th><td colSpan={3}>{p.parts}</td></tr>}
        </tbody></table>
        {!!p.key_points.length && <div className="js-note">{p.key_points.map((k, i) => <div key={i}><b>{k.type}:</b> {k.text}</div>)}</div>}
        <table className="js-table js-steps">
          <thead><tr><th style={{ width: '5%' }}>#</th><th style={{ width: '12%' }}>Phase</th><th>Instruction / acceptance</th><th style={{ width: '6%' }}>Done</th><th style={{ width: '11%' }}>Initials</th></tr></thead>
          <tbody>{p.steps.map(st => (
            <tr key={st.no}>
              <td>{st.no}</td><td>{st.phase}</td>
              <td>{st.instruction}{st.acceptance && <div className="js-acc">Accept: {st.acceptance}</div>}{st.safety && <div className="js-safe">⚠ {st.safety}</div>}
                {(st.sign_off || st.photo_required) && <div className="js-tags">{st.sign_off ? 'SIGN-OFF ' : ''}{st.photo_required ? 'PHOTO' : ''}</div>}</td>
              <td className="c"><Box on={stepDone(st.no)} /></td><td />
            </tr>))}</tbody>
        </table>
      </>}

      <h3>{p ? '3' : '2'} · Readiness and close-out</h3>
      <table className="js-table"><tbody>{prep.map(it => (
        <tr key={it.id}><td className="c" style={{ width: '6%' }}><Box on={isDone(it)} /></td><td>{it.title}{it.detail && <div className="js-acc">{it.detail}</div>}</td></tr>))}</tbody></table>

      <h3>Findings / readings</h3>
      <div className="js-lines">{Array.from({ length: 4 }, (_, i) => <div key={i} />)}</div>

      <table className="js-sign"><tbody><tr>
        <td><span>Technician</span></td><td><span>Supervisor</span></td><td><span>Date / time completed</span></td><td><span>Return-to-service test</span></td>
      </tr></tbody></table>
      {!!r?.sources?.length && <p className="js-src">Sources: {r.sources.map(s => s.label).join(' · ')}</p>}
    </section>
  );
}

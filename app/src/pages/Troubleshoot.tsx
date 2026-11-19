import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PLANT } from '../data';
import { postJSON, simPayload } from '../api/client';
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
  asset?: { asset_id: string; status: string; role: string; partner?: string; partner_status?: string; advice?: string } | null;
  plan?: PlanItem[];
}
interface Session { id: string; query: string; asset_id: string; answers: { question_id: string; answer: string }[]; first: Resp | null; resp: Resp | null; started: string }

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
      </div>

      {session && plan.length > 0 && (
        <aside className="plan card">
          <div className="plan-head">
            <div><b>Plan</b> <span className="muted small">{doneCount} / {plan.length} done</span></div>
            <div className="plan-btns no-print">
              <button type="button" className="btn ghost sm" onClick={() => setChecks({})}>Reset plan</button>
              <button type="button" className="btn sm" onClick={() => window.print()}><Icon name="print" size={13} />Print job sheet</button>
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

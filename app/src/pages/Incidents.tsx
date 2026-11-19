import { useEffect, useMemo, useState } from 'react';
import { PLANT } from '../data';
import { downloadBlob, getJSON, postBlob, postJSON, simPayload } from '../api/client';
import { Icon } from '../shell/icons';
import { Caster } from '../shell/Caster';
import { openAsset } from '../shell/TopBar';
import { useStatusStore } from '../store/statusStore';
import { useIntent } from '../store/intentStore';
import { fmtDate, nowStamp } from '../domain/assetInfo';
import '../styles/pages.css';

interface Field { field_no: number; section: string; field: string; filled_by: string; allowed_values: string; value: string; source: 'data' | 'ai' | 'user' }
interface Draft {
  report_id: string; asset_id: string; failure_at: string; shut_down: boolean; fields: Field[]; summary?: string; warnings: string[];
  linked: { cost: { production_loss: number; repair: number; labour: number; parts: number; explanation: string; pair_down: boolean; partner?: string };
    repair_or_replace: { recommendation: string; confidence: number }; standby: string; spare?: string; failure_event?: { event_id: string } | null };
  llm_used: boolean; [k: string]: unknown;
}
interface Row { report_id: string; asset_id: string; date: string; severity?: string; failure_mode?: string | null; status?: string; summary?: string | null; source: 'history' | 'submitted'; shut_down?: boolean }

const ASSETS = PLANT.equipment.filter(a => !a.asset_id.startsWith('SP-')).map(a => a.asset_id).concat(PLANT.equipment.filter(a => a.asset_id.startsWith('SP-')).map(a => a.asset_id));
const DETECTED = ['', 'Trip', 'Noise', 'Leak observed', 'Flow drop', 'Rounds reading', 'Inspection'];
const CONDITION = ['', 'Running', 'Starting', 'Standby', 'Stopped'];
const SRC_LABEL = { data: 'Data', ai: 'AI', user: 'User' } as const;
const php = (n: number) => `PHP ${Math.round(n).toLocaleString('en-US')}`;
const toLocalInput = (s: string) => s.replace(' ', 'T');

const blankForm = (asset = 'P-101B') => ({
  asset_id: asset, failure_at: toLocalInput(nowStamp()), reported_by: 'MT-02', detected_by: '', operating_condition: '',
  observed: '', actions_taken: '', downtime_h: '', procedure_used: '', parts_used: '', safety_injury: 'None', shut_down: false,
});

export function Incidents() {
  const [rows, setRows] = useState<{ submitted: Row[]; history: Row[] }>({ submitted: [], history: [] });
  const [mode, setMode] = useState<'list' | 'new'>('list');
  const [selected, setSelected] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blankForm());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<'' | 'draft' | 'docx' | 'submit' | 'pdf'>('');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ report_id: string; shut_down: boolean; asset_id: string } | null>(null);
  const intent = useIntent(s => s.incident);
  const pdfFail = (e: unknown) => setErr(e instanceof Error && /501|LibreOffice/.test(e.message)
    ? 'PDF export needs LibreOffice on the server (sudo apt install libreoffice-writer-nogui). Use Print → Save as PDF meanwhile.'
    : e instanceof Error ? e.message : 'PDF export failed');
  const downloadPdf = async (id: string) => {
    setBusy('pdf'); setErr(null);
    try {
      const res = await fetch(`/api/incidents/${encodeURIComponent(id)}/pdf`);
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      downloadBlob(await res.blob(), `${id}.pdf`);
    } catch (e) { pdfFail(e); } finally { setBusy(''); }
  };
  const downloadDraftPdf = async () => {
    if (!draft) return;
    setBusy('pdf'); setErr(null);
    try { downloadBlob(await postBlob('/api/incidents/render?format=pdf', draft), `${draft.report_id}.pdf`); } catch (e) { pdfFail(e); } finally { setBusy(''); }
  };
  const setStatus = useStatusStore(s => s.setStatus);

  const refresh = () => getJSON<{ submitted: Row[]; history: Row[] }>('/api/incidents').then(setRows).catch(() => setErr('Backend offline – start it on :8000'));
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!intent) return;
    const f = { ...blankForm(intent.asset_id), ...(intent.prefill ?? {}) };
    setForm(f); setDraft(null); setDone(null); setMode('new');
    useIntent.getState().clear('incident');
    if (intent.prefill) generate(f); // arriving from Troubleshoot: let Caster draft straight away
  }, [intent?.seq]);

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));
  const generate = async (f: typeof form = form) => {
    setBusy('draft'); setErr(null); setDone(null);
    try {
      const body = { ...f, failure_at: f.failure_at.replace('T', ' '), downtime_h: f.downtime_h === '' ? null : Number(f.downtime_h), sim: simPayload() };
      setDraft(await postJSON<Draft>('/api/incidents/draft', body));
    } catch (e) { setErr(e instanceof Error ? e.message : 'Draft failed'); } finally { setBusy(''); }
  };
  const editField = (no: number, value: string) => setDraft(d => d && ({ ...d, fields: d.fields.map(f => (f.field_no === no ? { ...f, value, source: 'user' } : f)) }));
  const docx = async () => {
    if (!draft) return;
    setBusy('docx');
    try { downloadBlob(await postBlob('/api/incidents/render?format=docx', draft), `${draft.report_id}.docx`); } catch (e) { setErr(e instanceof Error ? e.message : 'Render failed'); } finally { setBusy(''); }
  };
  const submit = async () => {
    if (!draft) return;
    setBusy('submit');
    try {
      const r = await postJSON<{ report_id: string; shut_down: boolean; asset_id: string; status_change?: { new_status: string; reason: string } }>('/api/incidents', { ...draft, shut_down: form.shut_down });
      if (r.status_change) setStatus(r.asset_id, r.status_change.new_status, r.status_change.reason);
      setDone(r); setDraft(null); refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Submit failed'); } finally { setBusy(''); }
  };

  const sections = useMemo(() => {
    const out = new Map<string, Field[]>();
    for (const f of [...(draft?.fields ?? [])].sort((a, b) => parseInt(a.section) - parseInt(b.section) || a.field_no - b.field_no)) {
      out.set(f.section, [...(out.get(f.section) ?? []), f]);
    }
    return [...out.entries()];
  }, [draft]);
  const srcCount = (s: Field['source']) => draft?.fields.filter(f => f.source === s).length ?? 0;

  return (
    <div className="page">
      <header className="page-head row no-print">
        <div>
          <h1>Incidents</h1>
          <p>Incident reports — required before an asset is taken out of service. Caster drafts the 37-field report from the records.</p>
        </div>
        {mode === 'list'
          ? <button type="button" className="btn primary" onClick={() => { setMode('new'); setDraft(null); setDone(null); }}><Icon name="plus" size={14} />New incident</button>
          : <button type="button" className="btn" onClick={() => setMode('list')}>Back to list</button>}
      </header>
      {err && <div className="alert-box bad no-print">{err}</div>}

      {mode === 'list' && (
        <div className="ir-layout">
          <div className="card ir-list">
            {rows.submitted.length > 0 && <div className="list-cap">Submitted in GearCast</div>}
            {rows.submitted.map(r => <IrRow key={r.report_id} r={r} active={selected?.report_id === r.report_id} onClick={() => { setSelected(r); setOpen(true); }} />)}
            <div className="list-cap">History · {rows.history.length} reports</div>
            {rows.history.map(r => <IrRow key={r.report_id} r={r} active={selected?.report_id === r.report_id} onClick={() => { setSelected(r); setOpen(true); }} />)}
          </div>
          {selected && (
            <aside className={`rr-drawer${open ? ' open' : ''}`} aria-hidden={!open}>
              <button type="button" className="rr-drawer-close btn ghost sm" onClick={() => setOpen(false)} aria-label="Collapse panel">›</button>
              <div className="card rr-detail ir-detail">
                <div className="sym-head"><span className="mono sym-id">{selected.report_id}</span><b>{selected.asset_id}</b>
                  {selected.severity && <span className={`sev sev-${String(selected.severity).toLowerCase().replace(' ', '-')}`}>{selected.severity}</span>}
                  <span className="muted">{fmtDate(selected.date)}</span></div>
                {selected.failure_mode && <p><b>{selected.failure_mode}</b></p>}
                <p className="ir-summary">{selected.summary || 'No summary recorded.'}</p>
                <div className="q-actions">
                  <button type="button" className="btn sm" onClick={() => openAsset(selected.asset_id)}><Icon name="plant" size={13} />Open {selected.asset_id}</button>
                  <button type="button" className="btn sm" disabled={busy === 'pdf'} onClick={() => downloadPdf(selected.report_id)}><Icon name="download" size={13} />{busy === 'pdf' ? 'Preparing…' : 'Download PDF'}</button>
                </div>
              </div>
            </aside>
          )}
          {selected && !open && <button type="button" className="rr-drawer-tab" onClick={() => setOpen(true)} aria-label="Show report">‹ Report</button>}
        </div>
      )}

      {mode === 'new' && (
        <div className="ir-new">
          {done && (
            <div className="alert-box ok no-print">
              <b>{done.report_id}</b> submitted.{done.shut_down ? ` ${done.asset_id} is now Shut Down.` : ''}
              <button type="button" className="btn sm" onClick={() => openAsset(done.asset_id)}><Icon name="plant" size={13} />View on overview</button>
            </div>
          )}
          <form className="card ir-form no-print" onSubmit={e => { e.preventDefault(); generate(); }}>
            <div className="form-grid">
              <label>Asset<select value={form.asset_id} onChange={e => set('asset_id', e.target.value)}>{ASSETS.map(a => <option key={a}>{a}</option>)}</select></label>
              <label>Date &amp; time of failure<input type="datetime-local" value={form.failure_at} onChange={e => set('failure_at', e.target.value)} /></label>
              <label>Reported by (role code)<input value={form.reported_by} onChange={e => set('reported_by', e.target.value)} /></label>
              <label>How detected<select value={form.detected_by} onChange={e => set('detected_by', e.target.value)}>{DETECTED.map(a => <option key={a} value={a}>{a || 'Let Caster infer'}</option>)}</select></label>
              <label>Operating condition<select value={form.operating_condition} onChange={e => set('operating_condition', e.target.value)}>{CONDITION.map(a => <option key={a} value={a}>{a || 'Let Caster infer'}</option>)}</select></label>
              <label>Downtime so far (h)<input type="number" min="0" step="0.5" value={form.downtime_h} onChange={e => set('downtime_h', e.target.value)} /></label>
              <label className="span2">What was observed (technician notes)<textarea rows={3} value={form.observed} onChange={e => set('observed', e.target.value)} placeholder="What you saw, heard and measured…" /></label>
              <label className="span2">Actions taken (with times)<textarea rows={3} value={form.actions_taken} onChange={e => set('actions_taken', e.target.value)} placeholder="14:25 started standby P-101A; 14:30 LOTO…" /></label>
              <label>Procedure used<input value={form.procedure_used} onChange={e => set('procedure_used', e.target.value)} placeholder="e.g. PR-06" /></label>
              <label>Parts used<input value={form.parts_used} onChange={e => set('parts_used', e.target.value)} placeholder="blank = from procedure" /></label>
              <label>Safety / injury<select value={form.safety_injury} onChange={e => set('safety_injury', e.target.value)}>{['None', 'Near miss', 'Injury'].map(a => <option key={a}>{a}</option>)}</select></label>
              <label className="toggle"><input type="checkbox" checked={form.shut_down} onChange={e => set('shut_down', e.target.checked)} />
                <span><b>Shut down {form.asset_id}</b><br /><span className="muted small">Submitting sets the asset to Shut Down</span></span></label>
            </div>
            <div className="q-actions">
              <button type="submit" className="btn primary" disabled={busy !== '' || !form.observed.trim()}>
                {busy === 'draft' ? <><Caster size={18} state="thinking" />Drafting…</> : <><Icon name="spark" size={14} />Generate draft</>}
              </button>
              {!form.observed.trim() && <span className="muted small">Add what was observed to generate a draft.</span>}
            </div>
          </form>

          {draft && (
            <div className="card ir-draft">
              <div className="ir-draft-head no-print">
                <div>
                  <div className="sym-head"><span className="mono sym-id">{draft.report_id}</span><b>Draft incident report · {draft.asset_id}</b></div>
                  <div className="src-legend">
                    <span className="src src-data">Data {srcCount('data')}</span><span className="src src-ai">AI {srcCount('ai')}</span><span className="src src-user">User {srcCount('user')}</span>
                    <span className="muted small">Every field is editable; edits become “User”.</span>
                  </div>
                </div>
                <div className="q-actions">
                  <button type="button" className="btn" onClick={docx} disabled={busy !== ''}><Icon name="download" size={14} />{busy === 'docx' ? 'Rendering…' : 'Download DOCX'}</button>
                  <button type="button" className="btn" disabled={busy === 'pdf'} onClick={downloadDraftPdf}><Icon name="download" size={14} />Download PDF</button>
                  <button type="button" className="btn" onClick={() => window.print()}><Icon name="print" size={14} />Print</button>
                  <button type="button" className={`btn ${form.shut_down ? 'danger' : 'primary'}`} onClick={submit} disabled={busy !== ''}>
                    {busy === 'submit' ? 'Submitting…' : form.shut_down ? `Submit & shut down ${draft.asset_id}` : 'Submit report'}
                  </button>
                </div>
              </div>
              {!!draft.warnings.length && <div className="alert-box warn no-print">{draft.warnings.join(' · ')}</div>}
              <div className="ir-tiles no-print">
                <div className="tile"><span>Production loss</span><b>{php(draft.linked.cost.production_loss)}</b><em>{draft.linked.cost.explanation.replace(/^PHP [\d,]+ – /, '')}</em></div>
                <div className="tile"><span>Repair estimate</span><b>{php(draft.linked.cost.repair)}</b><em>labour {php(draft.linked.cost.labour)} · parts {php(draft.linked.cost.parts)}</em></div>
                <div className="tile"><span>Repair or replace</span><b>{draft.linked.repair_or_replace.recommendation}</b><em>RR-Model v1 · {(draft.linked.repair_or_replace.confidence * 100).toFixed(0)}% confidence</em></div>
                <div className="tile"><span>Standby</span><b>{draft.linked.standby}</b><em>stored spare {draft.linked.spare ?? '—'}</em></div>
              </div>
              {draft.summary && <div className="ir-summary-box"><span className="muted small">Summary</span><p>{draft.summary}</p></div>}
              <div className="print-only print-title">INCIDENT REPORT · {draft.report_id} · Franklin Baker – Darong WWTP · Printed from GearCast</div>
              {sections.map(([sec, fs]) => (
                <section key={sec} className="ir-sec">
                  <h3>{sec}</h3>
                  {fs.map(f => (
                    <div key={f.field_no} className="ir-field">
                      <div className="ir-label">
                        <span>{f.field}</span>
                        <span className={`src src-${f.source}`} title={`Filled by: ${f.filled_by}`}>{SRC_LABEL[f.source]}</span>
                      </div>
                      <textarea className="ir-value" value={f.value ?? ''} rows={Math.min(6, Math.max(1, String(f.value ?? '').split('\n').length + Math.floor(String(f.value ?? '').length / 90)))}
                        onChange={e => editField(f.field_no, e.target.value)} aria-label={f.field} />
                      <div className="print-only ir-print-val">{f.value}</div>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IrRow({ r, active, onClick }: { r: Row; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`ir-row${active ? ' active' : ''}`} onClick={onClick}>
      <span className="mono ir-id">{r.report_id}</span>
      <span className="mono tag">{r.asset_id}</span>
      <span className="ir-mode">{r.failure_mode || (r.severity === 'Near miss' ? 'Near miss' : '—')}</span>
      {r.source === 'submitted' && <span className="badge new">new</span>}
      {r.severity && <span className={`sev sev-${String(r.severity).toLowerCase().replace(' ', '-')}`}>{r.severity}</span>}
    </button>
  );
}

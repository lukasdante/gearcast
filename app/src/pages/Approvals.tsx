/** PM findings filing (tablet form or scanned job sheet) and the approval queue shared by PM Monitoring, Spare Readiness
 *  and Plant Overview. Technicians file; Plant Supervisor / Engineer approve (layout changes: Plant Supervisor only). */
import { useEffect, useMemo, useState } from 'react';
import { OPS } from '../data';
import { Modal, dialog } from '../shell/Modal';
import { Icon } from '../shell/icons';
import { useAuth, ROLE_LABEL } from '../store/authStore';
import { fileUrl, useApprovals, STATUS_LABEL, type Approval, type Kind } from '../api/approvals';
import { REVIEWERS } from '../../../worker/src/rbac';
import '../styles/pages.css';

const pad = (n: number) => String(n).padStart(2, '0');
const nowLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export interface PmRowLite { id: string; task_id: string; task: string; asset_id: string; procs: string[]; est_h: number | null }
type Result = 'ok' | 'not_ok' | 'na';

/** Checklist from the task's procedure steps (acceptance criteria where given). */
function checklistFor(procs: string[]) {
  const steps = OPS.procedureSteps.filter(s => procs.includes(s.procedure_id)).sort((a, b) => a.procedure_id.localeCompare(b.procedure_id) || a.step_no - b.step_no);
  const items = steps.map(s => `${s.procedure_id} ${s.step_no}. ${s.acceptance_criteria || s.instruction}`);
  return (items.length ? items : ['Task done as per procedure', 'Unit returned to service / standby', 'Area clean, guards refitted']).slice(0, 20);
}

export function FindingsModal({ row, onClose, onFiled }: { row: PmRowLite; onClose: () => void; onFiled: (a: Approval) => void }) {
  const file = useApprovals(s => s.file);
  const items = useMemo(() => checklistFor(row.procs), [row.procs]);
  const [mode, setMode] = useState<'form' | 'scan'>('form');
  const [doneAt, setDoneAt] = useState(nowLocal());
  const [hours, setHours] = useState(row.est_h != null ? String(row.est_h) : '');
  const [checks, setChecks] = useState<{ result: Result; note: string }[]>(() => items.map(() => ({ result: 'ok', note: '' })));
  const [measurements, setMeasurements] = useState('');
  const [findings, setFindings] = useState('');
  const [parts, setParts] = useState('');
  const [followup, setFollowup] = useState(false);
  const [followupNote, setFollowupNote] = useState('');
  const [scan, setScan] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const setCheck = (i: number, p: Partial<{ result: Result; note: string }>) => setChecks(cs => cs.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const notOk = checks.filter(c => c.result === 'not_ok').length;

  const submit = async () => {
    if (mode === 'scan' && !scan) { setErr('Attach the scanned job sheet (PDF or photo).'); return; }
    if (mode === 'form' && !findings.trim() && !notOk) { setErr('Write the findings (or "No abnormal findings").'); return; }
    setBusy(true); setErr(null);
    try {
      const a = await file('pm_findings', {
        status_id: row.id, task_id: row.task_id, asset_id: row.asset_id, task: row.task, done_at: doneAt.replace('T', ' '), mode, hours: hours ? Number(hours) : null,
        checklist: mode === 'form' ? items.map((item, i) => ({ item, ...checks[i] })) : [],
        measurements, findings, parts_used: parts, followup: followup || notOk > 0, followup_note: followupNote,
      }, mode === 'scan' ? scan : null);
      onFiled(a); onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not file the findings'); } finally { setBusy(false); }
  };

  return (
    <Modal title={`PM findings · ${row.task_id} ${row.asset_id}`} onClose={onClose} width={640} footer={<>
      <button type="button" className="btn" onClick={onClose}>Cancel</button>
      <button type="button" className="btn primary" disabled={busy} onClick={submit}>{busy ? 'Filing…' : 'File findings'}</button>
    </>}>
      <p className="muted small">{row.task}. A Plant Supervisor or Engineer approves the record before the PM counts as done.</p>
      <div className="seg" role="tablist" aria-label="How to file">
        <button type="button" role="tab" aria-selected={mode === 'form'} className={mode === 'form' ? 'on' : ''} onClick={() => setMode('form')}>Fill in on tablet</button>
        <button type="button" role="tab" aria-selected={mode === 'scan'} className={mode === 'scan' ? 'on' : ''} onClick={() => setMode('scan')}>Upload scanned job sheet</button>
      </div>
      <div className="form-grid pmf-grid">
        <label>Done at<input type="datetime-local" value={doneAt} onChange={e => setDoneAt(e.target.value)} /></label>
        <label>Hours spent<input type="number" min="0" step="0.25" value={hours} onChange={e => setHours(e.target.value)} /></label>
        <label>Parts / lubricant used<input value={parts} onChange={e => setParts(e.target.value)} placeholder="e.g. SPP-012 ×1, grease 30 g" /></label>
      </div>
      {mode === 'form' ? (
        <div className="pmf-checks">
          <b className="small">Checklist</b>
          {items.map((it, i) => (
            <div key={i} className={`pmf-check${checks[i].result === 'not_ok' ? ' bad' : ''}`}>
              <span className="small">{it}</span>
              <span className="pmf-res">
                {(['ok', 'not_ok', 'na'] as Result[]).map(r => (
                  <button key={r} type="button" className={`btn sm ${checks[i].result === r ? (r === 'not_ok' ? 'danger solid' : 'primary') : 'ghost'}`} onClick={() => setCheck(i, { result: r })}>
                    {r === 'ok' ? 'OK' : r === 'not_ok' ? 'Not OK' : 'N/A'}
                  </button>
                ))}
              </span>
              {checks[i].result === 'not_ok' && <input className="pmf-note" value={checks[i].note} onChange={e => setCheck(i, { note: e.target.value })} placeholder="What was wrong?" />}
            </div>
          ))}
        </div>
      ) : (
        <label className="kb-drop pmf-scan">
          <input type="file" accept="application/pdf,image/*" capture="environment" className="kb-file" onChange={e => setScan(e.target.files?.[0] ?? null)} />
          <Icon name="upload" size={20} />
          {scan ? <><b>{scan.name}</b><span className="muted small">{(scan.size / 1024).toFixed(0)} kB · click to choose another</span></>
            : <><b>Scan or photograph the signed job sheet</b><span className="muted small">PDF, JPEG or PNG, max 8 MB</span></>}
        </label>
      )}
      <div className="form-grid pmf-grid">
        <label className="span2">Measurements (vibration, temperature, current, insulation…)<textarea rows={2} value={measurements} onChange={e => setMeasurements(e.target.value)} /></label>
        <label className="span2">Findings{mode === 'scan' ? ' (optional)' : ''}<textarea rows={3} value={findings} onChange={e => setFindings(e.target.value)} placeholder="What you saw, heard and measured. 'No abnormal findings' if all is well." /></label>
        <label className="toggle pmf-follow"><input type="checkbox" checked={followup || notOk > 0} disabled={notOk > 0} onChange={e => setFollowup(e.target.checked)} />
          <span><b>Follow-up needed</b>{notOk > 0 && <span className="muted small"> · {notOk} item(s) not OK</span>}</span></label>
        {(followup || notOk > 0) && <label className="span2">Follow-up note<input value={followupNote} onChange={e => setFollowupNote(e.target.value)} placeholder="e.g. order seal kit, re-check in 7 days" /></label>}
      </div>
      {err && <div className="alert-box bad">{err}</div>}
    </Modal>
  );
}

/** One record, with what was filed. */
function Details({ a }: { a: Approval }) {
  const p = a.payload;
  if (a.kind === 'pm_findings') return (
    <div className="ap-details small">
      <div><span className="muted">Done</span> {p.done_at}{p.hours ? ` · ${p.hours} h` : ''} · {p.mode === 'scan' ? 'scanned job sheet' : 'tablet form'}</div>
      {!!p.checklist?.length && <ul className="ap-check">{p.checklist.map((c: { item: string; result: Result; note: string }, i: number) => (
        <li key={i} className={c.result === 'not_ok' ? 'bad-t' : ''}><b>{c.result === 'ok' ? 'OK' : c.result === 'not_ok' ? 'NOT OK' : 'N/A'}</b> {c.item}{c.note ? ` — ${c.note}` : ''}</li>))}</ul>}
      {p.measurements && <div><span className="muted">Measurements</span> {p.measurements}</div>}
      {p.findings && <div><span className="muted">Findings</span> {p.findings}</div>}
      {p.parts_used && <div><span className="muted">Parts</span> {p.parts_used}</div>}
      {p.followup && <div className="warn-t">Follow-up needed{p.followup_note ? `: ${p.followup_note}` : ''}</div>}
    </div>
  );
  if (a.kind === 'spare_deploy') return (
    <div className="ap-details small">
      <div>{p.qty} × <b>{p.name || p.item_id}</b> <span className="mono muted">{p.item_id}</span>{p.asset_id ? <> → <b className="mono">{p.asset_id}</b></> : null} · {p.category}{p.major ? ' · major asset' : ' · accessory'}</div>
      {p.reason && <div><span className="muted">Reason</span> {p.reason}</div>}
    </div>
  );
  return <div className="ap-details small">{p.note || 'Layout edits to the plant model.'} <span className="muted">Approving publishes it to everyone.</span></div>;
}

/** Approval queue. Reviewers see pending records they can approve; everyone sees their own recent records. */
export function ApprovalQueue({ kinds, title = 'Approvals' }: { kinds: Kind[]; title?: string }) {
  const me = useAuth(s => s.user);
  const { items, refresh, review } = useApprovals();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  useEffect(() => { refresh(); }, [refresh]);
  if (!me) return null;
  const mine = (a: Approval) => kinds.includes(a.kind);
  const canReview = (a: Approval) => (REVIEWERS[a.kind] ?? []).includes(me.role);
  const pending = items.filter(a => mine(a) && a.status === 'pending' && canReview(a));
  const own = items.filter(a => mine(a) && a.created_by === me.username && !(a.status === 'pending' && canReview(a))).slice(0, showDone ? 30 : 5);
  if (!pending.length && !own.length) return null;

  const act = async (a: Approval, decision: 'approve' | 'reject') => {
    let note = '';
    if (decision === 'reject') {
      const r = await dialog.prompt({ title: `Reject ${a.id}`, label: 'Reason (sent back to the technician)', action: 'Reject' });
      if (r === null) return;
      note = r;
    }
    setBusy(a.id); setErr(null);
    try { await review(a.id, decision, note); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(''); }
  };
  const row = (a: Approval, actions: boolean) => (
    <div key={a.id} className={`ap-row s-${a.status}`}>
      <div className="ap-head">
        <span className="mono muted">{a.id}</span><b>{a.title}</b>
        <span className={`badge ap-${a.status}`}>{STATUS_LABEL[a.status]}</span>
        <span className="muted small">{a.created_by} ({ROLE_LABEL[a.created_role as keyof typeof ROLE_LABEL] ?? a.created_role}) · {a.created_at}</span>
      </div>
      <Details a={a} />
      {a.file && <a className="btn sm" href={fileUrl(a.id)} target="_blank" rel="noopener"><Icon name="file" size={12} />Open scan ({(a.file.bytes / 1024).toFixed(0)} kB)</a>}
      {a.status !== 'pending' && a.reviewed_by && <div className="small muted">{a.status === 'approved' ? 'Approved' : 'Rejected'} by {a.reviewed_by} · {a.reviewed_at}{a.review_note ? ` — ${a.review_note}` : ''}</div>}
      {actions && (
        <div className="q-actions">
          <button type="button" className="btn primary sm" disabled={busy === a.id} onClick={() => act(a, 'approve')}><Icon name="check" size={13} />Approve</button>
          <button type="button" className="btn sm" disabled={busy === a.id} onClick={() => act(a, 'reject')}>Reject</button>
        </div>
      )}
    </div>
  );
  return (
    <div className="card ap-queue">
      <div className="ap-queue-head"><b>{title}</b>{pending.length > 0 && <span className="badge warn">{pending.length} waiting for you</span>}
        <button type="button" className="btn ghost sm" onClick={() => refresh()}>Refresh</button></div>
      {err && <div className="alert-box bad">{err}</div>}
      {pending.map(a => row(a, true))}
      {own.length > 0 && <>
        <div className="ap-sub muted small">Filed by you</div>
        {own.map(a => row(a, false))}
        <button type="button" className="btn ghost sm" onClick={() => setShowDone(!showDone)}>{showDone ? 'Show fewer' : 'Show more'}</button>
      </>}
    </div>
  );
}

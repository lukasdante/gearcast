import { useEffect, useMemo, useState } from 'react';
import { NOW_DATE, OPS, roleWord } from '../data';
import { openAsset } from '../shell/TopBar';
import { useAuth, useCan } from '../store/authStore';
import { pushAssignments } from '../api/assignments';
import { approvedPm, useApprovals, STATUS_LABEL, type Approval } from '../api/approvals';
import { ApprovalQueue, FindingsModal } from './Approvals';
import '../styles/pages.css';

export type Band = 'overdue' | 'due' | 'soon' | 'later';
const BANDS: { id: Band; label: string; hint: string }[] = [
  { id: 'overdue', label: 'Overdue', hint: 'past due date' },
  { id: 'due', label: 'Due now', hint: 'today or tomorrow' },
  { id: 'soon', label: 'Coming up', hint: 'next 7 days' },
  { id: 'later', label: 'Planning', hint: 'beyond 7 days' },
];
const TECHS = ['', 'MT-01', 'MT-02', 'MT-03', 'MT-04', 'EN-01', 'EN-02', 'PS-01', 'PS-02'];
const AKEY = 'gearcast.pm.assign.v1';

const DAY = 86400000;
const toDay = (s: string) => new Date(s.slice(0, 10) + 'T12:00:00');
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmt = (s: string) => toDay(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const TODAY = toDay(NOW_DATE);

export interface Row {
  id: string; task_id: string; task: string; asset_id: string; interval_days: number | null; last_done: string | null;
  due: string; days: number; band: Band; est_h: number | null; role: string | null; stop: boolean; procs: string[];
}

/** PM rows. `done` = approved PM findings (status_id → record): an approved completion newer than the data's
 *  last-done date moves last done and the due date. */
export function buildRows(done?: Map<string, Approval>): Row[] {
  const tasks = new Map(OPS.pmTasks.map(t => [t.task_id, t]));
  return OPS.pmStatus.map(r0 => {
    const ap = done?.get(r0.status_id);
    const apDate = ap ? String(ap.payload.done_at).slice(0, 10) : null;
    const r = apDate && (!r0.last_done_date || apDate > r0.last_done_date.slice(0, 10)) ? { ...r0, last_done_date: apDate } : r0;
    // Same rule as the prototype: due = last done + interval; fall back to the scheduled next due date.
    const due = r.last_done_date && r.interval_days != null
      ? iso(new Date(toDay(r.last_done_date).getTime() + r.interval_days * DAY))
      : (r.next_due_date ?? NOW_DATE).slice(0, 10);
    const days = Math.round((toDay(due).getTime() - TODAY.getTime()) / DAY);
    const band: Band = days < 0 ? 'overdue' : days <= 1 ? 'due' : days <= 7 ? 'soon' : 'later';
    const t = tasks.get(r.task_id);
    return {
      id: r.status_id, task_id: r.task_id, task: r.task, asset_id: r.asset_id, interval_days: r.interval_days, last_done: r.last_done_date,
      due, days, band, est_h: t?.est_time_h ?? null, role: t?.role ?? null, stop: String(t?.stop_needed ?? '').toLowerCase().startsWith('yes'),
      procs: String(t?.procedure_ids ?? '').split(/[;,]/).map(s => s.trim()).filter(Boolean),
    };
  }).sort((a, b) => a.due.localeCompare(b.due) || a.task_id.localeCompare(b.task_id));
}

export function PmMonitoring() {
  const approvals = useApprovals(s => s.items);
  const refreshApprovals = useApprovals(s => s.refresh);
  useEffect(() => { refreshApprovals(); }, [refreshApprovals]);
  const done = useMemo(() => approvedPm(approvals), [approvals]);
  const allRows = useMemo(() => buildRows(done), [done]);
  const me = useAuth(s => s.user);
  const tech = me?.role === 'technician';
  const canAssign = useCan('pm.assign');
  const [filing, setFiling] = useState<Row | null>(null);
  const [filedMsg, setFiledMsg] = useState<string | null>(null);
  /** Latest findings record per PM row (any status), for the status chip. */
  const latest = useMemo(() => {
    const m = new Map<string, Approval>();
    for (const a of approvals) if (a.kind === 'pm_findings' && !m.has(a.payload.status_id)) m.set(a.payload.status_id, a);
    return m;
  }, [approvals]);
  const [band, setBand] = useState<Band | null>(null);
  const [q, setQ] = useState('');
  const [day, setDay] = useState<string | null>(null);
  const [month, setMonth] = useState(() => new Date(TODAY.getFullYear(), TODAY.getMonth(), 1));
  const [assign, setAssign] = useState<Record<string, string>>(() => { try { return JSON.parse(localStorage.getItem(AKEY) || '{}'); } catch { return {}; } });
  useEffect(() => {
    const reload = () => { try { setAssign(JSON.parse(localStorage.getItem(AKEY) || '{}')); } catch { /* storage unavailable */ } };
    window.addEventListener('gearcast:pm-assign', reload);
    return () => window.removeEventListener('gearcast:pm-assign', reload);
  }, []);
  const setTech = (id: string, v: string) => setAssign(a => {
    const n = { ...a, [id]: v }; if (!v) delete n[id];
    pushAssignments(n);
    return n;
  });
  // Technicians start on the tasks assigned to them and can switch to the whole schedule (view; assignment is read-only).
  const [mineOnly, setMineOnly] = useState(true);
  const rows = useMemo(() => (tech && mineOnly ? allRows.filter(r => assign[r.id] === me?.username) : allRows), [allRows, tech, mineOnly, assign, me?.username]);

  const counts = Object.fromEntries(BANDS.map(b => [b.id, rows.filter(r => r.band === b.id).length])) as Record<Band, number>;
  const byDay = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) (m.get(r.due) ?? m.set(r.due, []).get(r.due)!).push(r);
    return m;
  }, [rows]);
  const ql = q.trim().toLowerCase();
  const shown = rows.filter(r => (!band || r.band === band) && (!day || r.due === day)
    && (!ql || [r.task_id, r.task, r.asset_id, roleWord(r.role), r.procs.join(' '), assign[r.id]].some(v => String(v ?? '').toLowerCase().includes(ql))));

  // Month grid, weeks starting Monday.
  const first = new Date(month);
  const start = new Date(first.getTime() - ((first.getDay() + 6) % 7) * DAY);
  const cells = Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * DAY));
  const monthLabel = month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const shift = (n: number) => setMonth(m => new Date(m.getFullYear(), m.getMonth() + n, 1));

  return (
    <div className="page pm-page">
      <header className="page-head">
        <h1>{tech && mineOnly ? `My tasks · ${me?.username}` : 'PM Monitoring'}</h1>
        {tech && <div className="seg pm-scope" role="tablist" aria-label="Which tasks">
          <button type="button" role="tab" aria-selected={mineOnly} className={mineOnly ? 'on' : ''} onClick={() => setMineOnly(true)}>My tasks</button>
          <button type="button" role="tab" aria-selected={!mineOnly} className={!mineOnly ? 'on' : ''} onClick={() => setMineOnly(false)}>All PM tasks</button>
        </div>}
        <p>{tech ? (mineOnly ? 'Preventive maintenance tasks assigned to you. Record your findings on the tablet or upload the scanned job sheet.' : 'The whole PM schedule (view only; assignments are made by a Plant Supervisor or Engineer).') : 'Preventive maintenance due dates and delegation.'} Today is {TODAY.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.</p>
      </header>

      <div className="pm-top">
        <div className="pm-kpis">
          {BANDS.map(b => (
            <button key={b.id} type="button" className={`pm-kpi b-${b.id}${band === b.id ? ' on' : ''}`} onClick={() => { setBand(band === b.id ? null : b.id); setDay(null); }}>
              <span className="pm-kpi-n">{counts[b.id]}</span>
              <span className="pm-kpi-l">{b.label}</span>
              <span className="pm-kpi-h">{b.hint}</span>
            </button>
          ))}
        </div>

        <div className="card pm-cal">
          <div className="pm-cal-head">
            <button type="button" className="btn ghost sm" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
            <b>{monthLabel}</b>
            <button type="button" className="btn ghost sm" onClick={() => shift(1)} aria-label="Next month">›</button>
            <button type="button" className="btn ghost sm" onClick={() => setMonth(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1))}>Today</button>
          </div>
          <div className="pm-cal-grid">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className="pm-dow">{d}</div>)}
            {cells.map(c => {
              const k = iso(c), list = byDay.get(k) ?? [];
              const worst = BANDS.find(b => list.some(r => r.band === b.id))?.id;
              const cls = ['pm-day', c.getMonth() !== month.getMonth() && 'out', k === NOW_DATE && 'today', day === k && 'sel', worst && `b-${worst}`].filter(Boolean).join(' ');
              return (
                <button key={k} type="button" className={cls} onClick={() => { setDay(day === k ? null : k); setBand(null); }} disabled={!list.length}>
                  <span className="pm-dn">{c.getDate()}</span>
                  {list.length > 0 && <span className="pm-dc">{list.length}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {filedMsg && <div className="alert-box ok">{filedMsg}</div>}
      <ApprovalQueue kinds={['pm_findings']} title={tech ? 'My PM findings' : 'PM findings to approve'} />

      <div className="card pm-table-card">
        <div className="pm-table-head">
          <b>{day ? `Due ${fmt(day)}` : band ? BANDS.find(b => b.id === band)!.label : 'All PM tasks'}</b>
          <input className="sp-search pm-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search task, asset, procedure, role or assignee…" aria-label="Search PM tasks" />
          <span className="muted small">{shown.length} tasks</span>
          {(band || day) && <button type="button" className="btn ghost sm" onClick={() => { setBand(null); setDay(null); }}>Clear filter</button>}
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Due</th><th>Task</th><th>Asset</th><th>Interval</th><th>Last done</th><th>Time</th><th>Stop?</th><th>Procedure</th><th>Role</th><th>Assigned to</th><th>Findings</th></tr></thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.id} className={`b-${r.band}`}>
                  <td><span className={`pm-due b-${r.band}`}>{fmt(r.due)}</span><div className="muted small">{r.days < 0 ? `${-r.days} d overdue` : r.days === 0 ? 'today' : `in ${r.days} d`}</div></td>
                  <td><span className="mono muted">{r.task_id}</span> {r.task}</td>
                  <td>{!r.asset_id.includes('/')
                    ? <button type="button" className="link mono" onClick={() => openAsset(r.asset_id)}>{r.asset_id}</button>
                    : <span className="mono">{r.asset_id}</span>}</td>
                  <td className="mono">{r.interval_days != null ? `${r.interval_days} d` : '—'}</td>
                  <td className="mono">{r.last_done ? fmt(r.last_done) : '—'}</td>
                  <td className="mono">{r.est_h != null ? `${r.est_h} h` : '—'}</td>
                  <td>{r.stop ? <span className="badge warn">Stop</span> : <span className="muted">No</span>}</td>
                  <td className="mono small">{r.procs.join(', ') || '—'}</td>
                  <td className="small">{roleWord(r.role) ?? '—'}</td>
                  <td>
                    <select className="pm-assign" disabled={!canAssign} value={assign[r.id] ?? ''} onChange={e => setTech(r.id, e.target.value)} aria-label={`Assign ${r.task_id} ${r.asset_id}`}>
                      {TECHS.map(t => <option key={t} value={t}>{t || 'Unassigned'}</option>)}
                    </select>
                  </td>
                  <td className="pm-find-cell">
                    {(() => { const a = latest.get(r.id); return a && <span className={`badge ap-${a.status}`} title={a.review_note ?? ''}>{STATUS_LABEL[a.status]}</span>; })()}
                    <button type="button" className="btn ghost sm" onClick={() => setFiling(r)}>Record findings</button>
                  </td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={11} className="muted">{tech && mineOnly && !rows.length ? 'No tasks are assigned to you yet.' : 'No tasks match.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted small pm-foot">Due date = last done + interval (plant rule); an approved PM findings record counts as the last done date. Assignments are shared: each technician sees the tasks assigned to them under My tasks.</p>
      {filing && <FindingsModal row={filing} onClose={() => setFiling(null)}
        onFiled={a => setFiledMsg(a.status === 'approved' ? `${a.id} recorded – ${a.payload.task_id} ${a.payload.asset_id} counts as done.` : `${a.id} sent for approval to a Plant Supervisor or Engineer.`)} />}
    </div>
  );
}

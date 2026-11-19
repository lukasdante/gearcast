import { useEffect, useMemo, useState } from 'react';
import { NOW_DATE, OPS } from '../data';
import { openAsset } from '../shell/TopBar';
import '../styles/pages.css';

export type Band = 'overdue' | 'due' | 'soon' | 'later';
const BANDS: { id: Band; label: string; hint: string }[] = [
  { id: 'overdue', label: 'Overdue', hint: 'past due date' },
  { id: 'due', label: 'Due now', hint: 'today or tomorrow' },
  { id: 'soon', label: 'Coming up', hint: 'next 7 days' },
  { id: 'later', label: 'Planning', hint: 'beyond 7 days' },
];
const TECHS = ['', 'MT-01', 'MT-02', 'MT-03', 'MT-04', 'OP-01', 'OP-02'];
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

export function buildRows(): Row[] {
  const tasks = new Map(OPS.pmTasks.map(t => [t.task_id, t]));
  return OPS.pmStatus.map(r => {
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
  const rows = useMemo(buildRows, []);
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
    try { localStorage.setItem(AKEY, JSON.stringify(n)); } catch { /* storage unavailable */ }
    return n;
  });

  const counts = Object.fromEntries(BANDS.map(b => [b.id, rows.filter(r => r.band === b.id).length])) as Record<Band, number>;
  const byDay = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) (m.get(r.due) ?? m.set(r.due, []).get(r.due)!).push(r);
    return m;
  }, [rows]);
  const ql = q.trim().toLowerCase();
  const shown = rows.filter(r => (!band || r.band === band) && (!day || r.due === day)
    && (!ql || [r.task_id, r.task, r.asset_id, r.role, r.procs.join(' '), assign[r.id]].some(v => String(v ?? '').toLowerCase().includes(ql))));

  // Month grid, weeks starting Monday.
  const first = new Date(month);
  const start = new Date(first.getTime() - ((first.getDay() + 6) % 7) * DAY);
  const cells = Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * DAY));
  const monthLabel = month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const shift = (n: number) => setMonth(m => new Date(m.getFullYear(), m.getMonth() + n, 1));

  return (
    <div className="page pm-page">
      <header className="page-head">
        <h1>PM Monitoring</h1>
        <p>Preventive maintenance due dates and delegation. Today is {TODAY.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.</p>
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

      <div className="card pm-table-card">
        <div className="pm-table-head">
          <b>{day ? `Due ${fmt(day)}` : band ? BANDS.find(b => b.id === band)!.label : 'All PM tasks'}</b>
          <input className="sp-search pm-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search task, asset, procedure, role or assignee…" aria-label="Search PM tasks" />
          <span className="muted small">{shown.length} tasks</span>
          {(band || day) && <button type="button" className="btn ghost sm" onClick={() => { setBand(null); setDay(null); }}>Clear filter</button>}
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Due</th><th>Task</th><th>Asset</th><th>Interval</th><th>Last done</th><th>Time</th><th>Stop?</th><th>Procedure</th><th>Role</th><th>Assigned to</th></tr></thead>
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
                  <td className="small">{r.role ?? '—'}</td>
                  <td>
                    <select className="pm-assign" value={assign[r.id] ?? ''} onChange={e => setTech(r.id, e.target.value)} aria-label={`Assign ${r.task_id} ${r.asset_id}`}>
                      {TECHS.map(t => <option key={t} value={t}>{t || 'Unassigned'}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={10} className="muted">No tasks match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted small pm-foot">Due date = last done + interval (plant rule). Assignments are saved in this browser.</p>
    </div>
  );
}

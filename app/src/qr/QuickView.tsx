/** Asset quick view after a QR scan: everything a technician standing at the unit needs to know about its history,
 *  with shortcuts into Troubleshoot, PM findings, Incidents and Assets. Built on the same lookups as the Asset Inspector. */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { OPS, assetById } from '../data';
import { backupInfo, isDown, viewAsset } from '../domain/status';
import { fmtDate, historyFor, kindForAsset, partsFor, reliabilityFor, workOrdersFor, failuresFor, incidentsFor, roundsFor, checksFor, vibZone } from '../domain/assetInfo';
import { areaName } from '../domain/layout';
import { useStatusCtx, useStatusStore } from '../store/statusStore';
import { useIntent } from '../store/intentStore';
import { navigate } from '../store/route';
import { useAuth } from '../store/authStore';
import { Icon } from '../shell/icons';
import { openAsset } from '../shell/TopBar';
import { RoleChip, StatusChip } from '../overview/Inspector';
import { thumbUrl } from '../overview/thumbs';
import { approvedPm, useApprovals, STATUS_LABEL, type Approval } from '../api/approvals';
import { getJSON } from '../api/client';
import { buildRows, type Row } from '../pages/PmMonitoring';
import { FindingsModal } from '../pages/Approvals';
import { SCAN_PURPOSES, scanHistory, useScan, type Purpose, type Scan, type View } from './scanStore';

const expand = (t: string) => { const m = t.match(/^(.*?)([A-Z])\/([A-Z])$/); return m ? [m[1] + m[2], m[1] + m[3]] : [t]; };
const roleName = (r: string | null) => (r === 'technician' ? 'Technician' : r === 'engineer' ? 'Engineer' : r === 'supervisor' ? 'Supervisor' : '');

function Card({ title, aside, children, className = '' }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`qv-card ${className}`}>
      <h3>{title}{aside != null && aside !== '' && <span className="muted">{aside}</span>}</h3>
      {children}
    </section>
  );
}
const Empty = ({ children }: { children: ReactNode }) => <p className="muted small">{children}</p>;

interface SubmittedIR { report_id: string; asset_id: string; date: string; severity: string | null; failure_mode: string | null; status: string | null }

function useScans(assetId: string, rev: number) {
  const [scans, setScans] = useState<Scan[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    scanHistory(assetId).then(s => on && (setScans(s), setErr(null))).catch(e => on && setErr(e instanceof Error ? e.message : 'Offline'));
    return () => { on = false; };
  }, [assetId, rev]);
  return { scans, err };
}

function AssetView({ id, view }: { id: string; view: View }) {
  const ctx = useStatusCtx();
  const appended = useStatusStore(s => s.appended);
  const { closeView, note, purpose, setPurpose, rev } = useScan();
  const me = useAuth(s => s.user);
  const approvals = useApprovals(s => s.items);
  const refreshApprovals = useApprovals(s => s.refresh);
  useEffect(() => { refreshApprovals(); }, [refreshApprovals]);
  const [submitted, setSubmitted] = useState<SubmittedIR[]>([]);
  useEffect(() => {
    let on = true;
    getJSON<{ submitted: SubmittedIR[] }>('/api/incidents').then(r => on && setSubmitted(r.submitted.filter(x => x.asset_id === id))).catch(() => {});
    return () => { on = false; };
  }, [id]);
  const [filing, setFiling] = useState<Row | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const { scans, err: scanErr } = useScans(id, rev);

  const a = assetById.get(id)!;
  const v = viewAsset(ctx, id);
  const st = ctx.statusById[id];
  const hist = historyFor(id, appended);
  const rel = reliabilityFor(id);
  const b = backupInfo(ctx, id);
  const wos = workOrdersFor(id).slice(0, 6);
  const fails = failuresFor(id).slice(0, 5);
  const irs = incidentsFor(id).slice(0, 5);
  const parts = partsFor(id);
  const low = parts.filter(p => p.below_min || p.qty_on_hand < p.min_qty);
  const done = useMemo(() => approvedPm(approvals), [approvals]);
  const pm = useMemo(() => buildRows(done).filter(r => expand(r.asset_id).includes(id)), [done, id]);
  const latestFinding = useMemo(() => {
    const m = new Map<string, Approval>();
    for (const x of approvals) if (x.kind === 'pm_findings' && !m.has(x.payload.status_id)) m.set(x.payload.status_id, x);
    return m;
  }, [approvals]);
  const dc = checksFor(id, 120).filter(c => c.running).pop();
  const mr = roundsFor(id, 120).filter(r => r.flow_m3h != null || r.current_a != null || r.discharge_pressure_bar != null).pop();
  const img = thumbUrl(kindForAsset(id));
  const tag = view.tag;

  const go = (action: string, fn: () => void) => { note(action); closeView(); fn(); };
  const troubleshoot = () => go('Opened troubleshoot', () => { useIntent.getState().setTroubleshoot('', id); navigate('troubleshoot'); });
  const incident = () => go('Opened incident report', () => { useIntent.getState().setIncident(id); navigate('incidents'); });
  const assets = () => go('Viewed full asset page', () => { useIntent.getState().setAsset(id); navigate('assets'); });
  const plant = () => go('Viewed on plant overview', () => openAsset(id));
  const findings = (r: Row | undefined) => { if (!r) return; note('Opened checklist'); setFiling(r); };

  return (
    <>
      <div className="qv-head">
        <span className="qv-thumb">{img ? <img src={img} alt="" /> : <Icon name="assets" size={28} />}</span>
        <div className="qv-title">
          <div className="qv-id"><span className="mono">{id}</span><StatusChip v={v} /><RoleChip v={v} /></div>
          <div className="qv-desc">{a.description}</div>
          <div className="muted small">
            {a.location_node && a.location_node !== 'STORE' ? `${a.location_node} · ${areaName(a.location_node)}` : 'Spares store'}
            {a.criticality ? ` · criticality ${a.criticality}` : ''}
            {tag ? ` · tag ${tag.tag_id}${tag.label_placement ? ` (${tag.label_placement})` : ''}` : ''}
          </div>
          {v.key === 'startNeeded' && <div className="qv-warn">START NEEDED – the partner unit is down</div>}
        </div>
      </div>

      {view.scan && (
        <div className="qv-scan">
          <Icon name="qr" size={14} />
          <span>{view.scan.source === 'queued' ? 'Offline – scan saved on this device, sent when back online' : `Scan ${view.scan.scan_id} logged ${fmtDate(view.scan.scanned_at, true)}`}</span>
          <span className="qv-purpose" role="group" aria-label="Purpose">
            {SCAN_PURPOSES.map(p => <button key={p} type="button" className={purpose === p ? 'on' : ''} aria-pressed={purpose === p} onClick={() => setPurpose(p as Purpose)}>{p}</button>)}
          </span>
        </div>
      )}

      <div className="qv-actions">
        <button type="button" className="btn primary" onClick={troubleshoot}><Icon name="wrench" size={15} />Start troubleshoot</button>
        <button type="button" className="btn" disabled={!pm.length} onClick={() => findings(pm[0])}><Icon name="pm" size={15} />File PM findings</button>
        <button type="button" className="btn" onClick={incident}><Icon name="incidents" size={15} />Report incident</button>
        <button type="button" className="btn ghost" onClick={assets}><Icon name="assets" size={15} />Open in Assets</button>
        {a.location_node && a.location_node !== 'STORE' && <button type="button" className="btn ghost" onClick={plant}><Icon name="plant" size={15} />Plant overview</button>}
      </div>
      {msg && <p className="qv-ok">{msg}</p>}

      <div className="qv-kpis">
        <div><b className="mono">{st?.current_status ?? v.status}</b><span>since {fmtDate(st?.status_since ?? hist[0]?.effective_at, true)}</span></div>
        <div><b className="mono">{rel.count}</b><span>failures since install</span></div>
        <div><b className="mono">{rel.mtbfDays != null ? `${rel.mtbfDays}d` : '—'}</b><span>MTBF</span></div>
        <div className={pm[0] && pm[0].days < 0 ? 'bad' : pm[0] && pm[0].days <= 7 ? 'warn' : ''}>
          <b className="mono">{pm[0] ? (pm[0].days < 0 ? `${-pm[0].days}d late` : pm[0].days === 0 ? 'today' : fmtDate(pm[0].due)) : '—'}</b>
          <span>{pm[0] ? `next PM · ${pm[0].task_id}` : 'no PM tasks'}</span>
        </div>
      </div>

      <div className="qv-grid">
        <Card title="Status history" aside={hist.length ? `${Math.min(hist.length, 6)} of ${hist.length}` : ''}>
          {hist.length === 0 ? <Empty>No status changes recorded.</Empty> : (
            <ul className="timeline">
              {hist.slice(0, 6).map(h => (
                <li key={h.history_id} className={isDown(h.new_status) ? 'down' : ''}>
                  <div><span className="mono muted">{fmtDate(h.effective_at, true)}</span> {h.previous_status ? `${h.previous_status} → ` : ''}<b>{h.new_status}</b>{h.data_mode === 'Simulated' && <span className="sim-tag">SIM</span>}</div>
                  <div className="muted small">{h.reason ?? '—'}{h.source_id ? ` · ${h.source_id}` : ''}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="PM status" aside={pm.length ? `${pm.filter(r => r.days < 0).length} overdue · ${pm.length}` : ''}>
          {pm.length === 0 ? <Empty>No PM tasks for this asset.</Empty> : (
            <ul className="qv-pm">
              {pm.slice(0, 6).map(r => {
                const f = latestFinding.get(r.id);
                return (
                  <li key={r.id} className={r.days < 0 ? 'qv-late' : r.days <= 7 ? 'qv-near' : ''}>
                    <div className="qv-pm-t">{r.task}<span className="muted small"> · {r.task_id} · last {fmtDate(r.last_done)}{f ? ` · ${STATUS_LABEL[f.status]}` : ''}</span></div>
                    <span className="mono qv-due">{r.days < 0 ? `${-r.days}d overdue` : r.days === 0 ? 'today' : `due ${fmtDate(r.due)}`}</span>
                    <button type="button" className="btn sm" onClick={() => findings(r)}>Findings</button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Recent work orders" aside={wos.length ? `last ${wos.length}` : ''}>
          {wos.length === 0 ? <Empty>No work orders.</Empty> : (
            <ul className="rec-list">
              {wos.map(w => (
                <li key={w.wo_id}>
                  <div><span className="mono muted">{w.wo_id}</span> {w.title} <span className={`wo-st ${w.status === 'Closed' ? '' : 'open'}`}>{w.status}</span></div>
                  <div className="muted small">{fmtDate(w.reported_at)} · {w.wo_type} · {w.priority}{w.duration_h != null ? ` · ${w.duration_h} h` : ''}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Failures and incidents" aside={fails.length + irs.length + submitted.length || ''}>
          {fails.length === 0 && irs.length === 0 && submitted.length === 0 ? <Empty>No failures or incident reports since installation.</Empty> : (
            <ul className="rec-list">
              {submitted.slice(0, 4).map(r => (
                <li key={r.report_id}>
                  <div><span className="mono muted">{r.report_id}</span> {r.failure_mode ?? 'Incident report'} <span className="wo-st open">Submitted</span></div>
                  <div className="muted small">{fmtDate(r.date)}{r.severity ? ` · ${r.severity}` : ''}</div>
                </li>
              ))}
              {fails.map(f => (
                <li key={f.event_id}>
                  <div><span className="mono muted">{fmtDate(f.failure_at)}</span> {f.failure_mode ?? f.symptom}</div>
                  <div className="muted small">{f.root_cause ? `Root cause: ${f.root_cause}` : f.symptom}{f.downtime_h ? ` · ${f.downtime_h} h down` : ''}{f.main_wo_id ? ` · ${f.main_wo_id}` : ''}</div>
                </li>
              ))}
              {irs.map(r => (
                <li key={r.report_id}>
                  <div><span className="mono muted">{r.report_id}</span> {r.severity} <span className="muted small">· {r.status}</span></div>
                  <div className="muted small">{fmtDate(r.incident_date)}{r.failure_mode ? ` · ${r.failure_mode}` : ''}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Last readings">
          {!dc && !mr ? <Empty>No running readings recorded recently.</Empty> : (
            <>
              {dc && (
                <div className="readings">
                  {(['vib_de_mm_s', 'vib_nde_mm_s'] as const).map(k => (
                    <div key={k} className={`reading z-${vibZone(dc[k])}`}>
                      <span className="muted small">{k === 'vib_de_mm_s' ? 'Vibration DE' : 'Vibration NDE'}</span>
                      <span className="mono val">{dc[k] == null ? '—' : dc[k]!.toFixed(1)}<small>mm/s</small></span>
                    </div>
                  ))}
                </div>
              )}
              <dl className="kv">
                {dc && <div><dt>Daily check</dt><dd className="mono">{fmtDate(dc.date)}</dd></div>}
                {dc && (dc.temp_de_c != null || dc.temp_nde_c != null) && <div><dt>Bearing temp DE / NDE</dt><dd className="mono">{dc.temp_de_c ?? '—'} / {dc.temp_nde_c ?? '—'} °C</dd></div>}
                {dc?.seal_reservoir_level_pct != null && <div><dt>Seal reservoir</dt><dd className="mono">{dc.seal_reservoir_level_pct} %</dd></div>}
                {mr && <div><dt>Manual round</dt><dd className="mono">{fmtDate(mr.date)} {mr.time}</dd></div>}
                {mr?.flow_m3h != null && <div><dt>Flow</dt><dd className="mono">{mr.flow_m3h} m³/h</dd></div>}
                {mr?.discharge_pressure_bar != null && <div><dt>Discharge pressure</dt><dd className="mono">{mr.discharge_pressure_bar} bar</dd></div>}
                {mr?.current_a != null && <div><dt>Motor current</dt><dd className="mono">{mr.current_a} A</dd></div>}
              </dl>
              <button type="button" className="link small" onClick={assets}>Trends in Assets ›</button>
            </>
          )}
        </Card>

        <Card title="Spares and compatibility" aside={parts.length ? `${low.length} below min · ${parts.length} parts` : ''}>
          <dl className="kv">
            {b.partner && <div><dt>Installed standby</dt><dd><span className="mono">{b.partner.id}</span> <span className="muted">{b.partner.status}</span></dd></div>}
            {b.spareId && <div><dt>Stored spare</dt><dd><button type="button" className="link mono" onClick={() => useScan.getState().show(b.spareId!)}>{b.spareId}</button> <span className={b.spareReadiness === 'Ready' ? 'ok' : 'warn'}>{b.spareReadiness ?? 'Not checked'}</span> <span className="muted small">· checked {fmtDate(b.spareLastCheck)}</span></dd></div>}
            {b.backsUp.length > 0 && <div><dt>Fits</dt><dd className="mono">{b.backsUp.join(', ')}</dd></div>}
            {!b.partner && !b.spareId && !b.backsUp.length && <div><dt>Backup</dt><dd className="muted">No installed standby or stored spare recorded</dd></div>}
          </dl>
          {parts.length > 0 && (
            <ul className="parts">
              {[...low, ...parts.filter(p => !low.includes(p))].slice(0, 5).map(p => {
                const l = low.includes(p);
                return (
                  <li key={p.part_id} className={l ? 'low' : ''}>
                    <div className="part-name">{p.part_name}{p.critical && <span className="crit">CRITICAL</span>}</div>
                    <div className="part-meta muted small"><span className="mono">{p.part_id}</span> · {p.storage_location ?? '—'}{p.lead_time_days != null ? ` · lead ${p.lead_time_days}d` : ''}</div>
                    <div className="part-stock mono"><b>{p.qty_on_hand}</b><span className="muted">/ min {p.min_qty} {p.unit}</span></div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Scan history" aside={scans ? `${scans.length}${tag ? ` · ${tag.tag_id}` : ''}` : ''} className="qv-wide">
          {scanErr ? <Empty>Scan history unavailable ({scanErr}).</Empty> : !scans ? <Empty>Loading…</Empty> : scans.length === 0 ? <Empty>No scans of this tag yet.</Empty> : (
            <div className="qv-scans">
              <table>
                <thead><tr><th>When</th><th>Who</th><th>Purpose</th><th>Action</th><th>WO</th><th>Device</th></tr></thead>
                <tbody>
                  {scans.slice(0, 15).map(s => (
                    <tr key={s.scan_id} className={s.user === me?.username && s.source === 'app' ? 'me' : ''}>
                      <td className="mono">{fmtDate(s.scanned_at, true)}</td>
                      <td><span className="mono">{s.user}</span> <span className="muted small">{roleName(s.user_role)}</span></td>
                      <td>{s.purpose ?? '—'}</td>
                      <td>{s.action ?? '—'}</td>
                      <td className="mono">{s.linked_wo_id ?? ''}</td>
                      <td className="mono muted">{s.device_id ?? ''}{!s.online && <span className="sim-tag">OFFLINE</span>}{s.source === 'pilot' && <span className="muted small"> · pilot</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {filing && <FindingsModal row={filing} onClose={() => setFiling(null)}
        onFiled={x => setMsg(x.status === 'approved' ? `${x.id} recorded – ${x.payload.task_id} counts as done.` : `${x.id} sent for approval to a Plant Supervisor or Engineer.`)} />}
    </>
  );
}

function LocationView({ view }: { view: View }) {
  const ctx = useStatusCtx();
  const show = useScan(s => s.show);
  const ids = view.assets.filter(x => assetById.has(x));
  return (
    <>
      <div className="qv-head">
        <span className="qv-thumb"><Icon name="spares" size={28} /></span>
        <div className="qv-title">
          <div className="qv-id"><span className="mono">{view.tag?.tag_id ?? 'STORE'}</span></div>
          <div className="qv-desc">Spares store{view.tag?.label_placement ? ` · ${view.tag.label_placement}` : ''}</div>
          <div className="muted small">Stored spare units – tap one to see its history and readiness.</div>
        </div>
      </div>
      <div className="qv-actions">
        <button type="button" className="btn" onClick={() => { useScan.getState().note('Opened spare readiness'); useScan.getState().closeView(); navigate('spares'); }}><Icon name="spares" size={15} />Spare Readiness</button>
      </div>
      <ul className="qv-store">
        {ids.map(id => {
          const sum = OPS.spareSummary.find(s => s.asset_id === id);
          return (
            <li key={id}>
              <button type="button" onClick={() => show(id)}>
                <span className="mono">{id}</span><StatusChip v={viewAsset(ctx, id)} />
                <span className="muted small">{assetById.get(id)?.description}</span>
                <span className={sum?.readiness_status === 'Ready' ? 'ok small' : 'warn small'}>{sum?.readiness_status ?? 'Not checked'}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function QuickView() {
  const view = useScan(s => s.view);
  const closeView = useScan(s => s.closeView);
  const openScanner = useScan(s => s.openScanner);
  useEffect(() => {
    if (!view) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.modal-backdrop')) closeView(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, closeView]);
  if (!view) return null;
  const known = view.asset_id && assetById.has(view.asset_id);
  return (
    <div className="qr-sheet-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) closeView(); }}>
      <div className="qr-sheet qv" role="dialog" aria-modal="true" aria-label="Asset quick view">
        <header>
          <h2><Icon name="qr" size={18} />{view.kind === 'location' ? 'Location' : 'Asset quick view'}</h2>
          <span className="qv-hdr-actions">
            <button type="button" className="btn sm" onClick={() => { closeView(); openScanner(); }}><Icon name="camera" size={14} />Scan next</button>
            <button type="button" className="icon-btn" onClick={closeView} aria-label="Close"><Icon name="close" /></button>
          </span>
        </header>
        <div className="qv-body" key={view.seq}>
          {view.kind === 'location' ? <LocationView view={view} />
            : known ? <AssetView id={view.asset_id!} view={view} />
              : <p className="muted">Asset {view.asset_id} is not in this plant’s register.</p>}
        </div>
      </div>
    </div>
  );
}

/**
 * Right-hand Asset Inspector: port of the prototype's asset panel + asset page tabs
 * (renderAssetPanelImpl, LassetTab, renderAssetCharts, getPMForAsset, getSpareRows, failuresSince, procIdsForAsset),
 * organised as Overview · Readings · Maintenance · History · Parts.
 */
import { useState, type ReactNode } from 'react';
import { OPS, PLANT, assetById, roleWord, type Procedure } from '../data';
import { backupInfo, changeoverOffer, isDown, lastChangeover, viewAsset, type AssetView } from '../domain/status';
import {
  checksFor, dateMs, figureFor, fmtDate, historyFor, incidentsFor, kindForAsset, partsFor, pmFor, proceduresFor,
  reliabilityFor, roundsFor, vibZone, windowStart, workOrdersFor, failuresFor,
} from '../domain/assetInfo';
import { areaName, itemNode, type LayoutItem } from '../domain/layout';
import { useStatusCtx, useStatusStore } from '../store/statusStore';
import { useUi } from '../store/uiStore';
import { useIntent } from '../store/intentStore';
import { navigate } from '../store/route';
import { Icon } from '../shell/icons';
import { Modal } from '../shell/Modal';
import { openAsset } from '../shell/TopBar';
import { thumbUrl } from './thumbs';
import type { Live } from './live';
import { ShutdownEstimate } from './ShutdownCost';

const seedStatus = new Map(PLANT.equipmentStatus.map(s => [s.asset_id, s.current_status]));
type Tab = 'overview' | 'readings' | 'maintenance' | 'history' | 'parts';
const TABS: [Tab, string][] = [['overview', 'Overview'], ['readings', 'Readings'], ['maintenance', 'Maintenance'], ['history', 'History'], ['parts', 'Parts']];

export function StatusChip({ v }: { v: AssetView }) {
  return <span className={`chip-status k-${v.key}`}><span className="dot" />{v.status}</span>;
}
export function RoleChip({ v }: { v: AssetView }) {
  return <span className={`chip-role k-${v.key}`}>{v.chip}</span>;
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="insp-sec">
      <h3>{title}{aside != null && <span className="muted">{aside}</span>}</h3>
      {children}
    </section>
  );
}

function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd>{v === null || v === undefined || v === '' ? <span className="muted">—</span> : v}</dd></div>
      ))}
    </dl>
  );
}
const Empty = ({ children }: { children: ReactNode }) => <p className="muted small empty">{children}</p>;

// ---------------------------------------------------------------- hero

export function Hero({ id, kind, onOpen }: { id: string; kind: string; onOpen?: () => void }) {
  const [broken, setBroken] = useState<string | null>(null);
  const [showFig, setShowFig] = useState(false);
  const src = thumbUrl(kind);
  const fig = figureFor(id);
  return (
    <div className="insp-hero">
      {src && broken !== src
        ? (onOpen
          ? <button type="button" className="hero-open" onClick={onOpen} title={`Open ${id} in Assets`}><img src={src} alt={`${id} 3D model`} onError={() => setBroken(src)} /><span className="hero-hint">Open in Assets ›</span></button>
          : <img src={src} alt={`${id} 3D model`} onError={() => setBroken(src)} />)
        : <span className="hero-fallback"><Icon name="assets" size={40} stroke={1.2} /></span>}
      {fig && <button type="button" className="hero-ref" onClick={() => setShowFig(true)}><Icon name="layers" size={13} />Reference drawing</button>}
      {showFig && fig && (
        <Modal title={fig.title} onClose={() => setShowFig(false)} width={760}>
          <img className="ref-fig" src={fig.src} alt={fig.title} />
          <p className="muted small">Illustrative reference drawing from the maintenance literature, not this exact unit.</p>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- overview tab

function Actions({ id, v }: { id: string; v: AssetView }) {
  const ctx = useStatusCtx();
  const setStatus = useStatusStore(s => s.setStatus);
  const switchDuty = useStatusStore(s => s.switchDuty);
  const own = ctx.statusById[id]?.current_status ?? '';
  const offer = changeoverOffer(ctx, id);
  const simulated = own === 'Shut Down';
  const seed = seedStatus.get(id);
  const restore = seed && !isDown(seed) ? seed : 'In Service';
  return (
    <>
      {offer && (
        <div className="offer">
          <Icon name="swap" />
          <div>
            <b className="mono">{offer.down}</b> is down. Installed standby <b className="mono">{offer.start}</b> is available.
            <button type="button" className="btn primary sm" onClick={() => switchDuty(offer.pairId, offer.start, offer.down)}>
              Switch duty to {offer.start}
            </button>
          </div>
        </div>
      )}
      <div className="insp-actions">
        <button type="button" className="btn danger sm" disabled={v.key === 'stored' || simulated}
          onClick={() => setStatus(id, 'Shut Down', 'Simulated fault (Plant Overview)')}>
          <Icon name="bolt" />Simulate fault
        </button>
        <button type="button" className="btn sm" disabled={!simulated} onClick={() => setStatus(id, restore, 'Simulated fault cleared')}>
          <Icon name="check" />Clear
        </button>
        <button type="button" className="btn ghost sm" onClick={() => { useIntent.getState().setTroubleshoot('', id); navigate('troubleshoot'); }}>
          <Icon name="wrench" />Troubleshoot
        </button>
      </div>
      <p className="muted small note">Simulation only. In the real flow an incident report is required before an asset is taken out of service.</p>
    </>
  );
}

export function OverviewTab({ id, v }: { id: string; v: AssetView }) {
  const ctx = useStatusCtx();
  const appended = useStatusStore(s => s.appended);
  const a = assetById.get(id)!;
  const b = backupInfo(ctx, id);
  const h = historyFor(id, appended)[0] ?? null;
  const st = ctx.statusById[id];
  const co = lastChangeover(ctx, id);
  const rel = reliabilityFor(id);
  const pm = pmFor(id);
  const nextPm = pm[0];
  const overdue = pm.filter(r => (r.days_until_due ?? 0) < 0).length;
  const unit = (x: string | null, u: string) => (x ? <span className="mono">{x} {u}</span> : null);
  const source = h?.source_type && h?.source_id ? `${h.source_type} ${h.source_id}` : h?.source_type || h?.source_id || null;
  const spare = id.startsWith('SP-') ? b : null;
  return (
    <>
      <div className="kpis">
        <div><span className="mono kpi-n">{rel.count}</span><span className="kpi-l">failures since install</span></div>
        <div><span className="mono kpi-n">{rel.mtbfDays != null ? `${rel.mtbfDays}d` : '—'}</span><span className="kpi-l">MTBF</span></div>
        <div className={overdue ? 'bad' : nextPm && (nextPm.days_until_due ?? 99) <= 7 ? 'warn' : ''}>
          <span className="mono kpi-n">{overdue ? overdue : nextPm?.days_until_due != null ? `${nextPm.days_until_due}d` : '—'}</span>
          <span className="kpi-l">{overdue ? 'PM overdue' : 'next PM due'}</span>
        </div>
      </div>

      <div className={`backup${b.partner && isDown(b.partner.status) ? ' bad' : ''}`}>
        <Icon name="layers" />
        <div>
          {b.partner && <div>Partner <button type="button" className="link mono" onClick={() => openAsset(b.partner!.id)}>{b.partner.id}</button> <RoleChip v={b.partner} /> <span className="muted">{b.partner.status}</span></div>}
          {b.spareId && <div>Stored spare <button type="button" className="link mono" onClick={() => openAsset(b.spareId!)}>{b.spareId}</button> <span className={b.spareReadiness === 'Ready' ? 'ok' : 'warn'}>{b.spareReadiness ?? 'Not checked'}</span> <span className="muted">· checked {fmtDate(b.spareLastCheck)}</span></div>}
          {b.backsUp.length > 0 && <div>Backs up <span className="mono">{b.backsUp.join(', ')}</span></div>}
          {co && <div className="muted small">Last changeover {fmtDate(co.at, co.simulated)}: <span className="mono">{co.duty}</span> duty · <span className="mono">{co.standby}</span> standby{co.simulated ? ' (simulated)' : ''}</div>}
          {!b.partner && !b.spareId && !b.backsUp.length && <div className="muted">No installed standby or stored spare recorded</div>}
        </div>
      </div>

      <Section title="Simulation"><Actions id={id} v={v} /></Section>
      <ShutdownEstimate id={id} />

      <Section title="Current status">
        <KV rows={[
          ['Status', <span>{st?.current_status ?? '—'}{v.status !== st?.current_status && <span className="muted"> · shown as {v.status}</span>}</span>],
          ['Since', <span className="mono">{fmtDate(st?.status_since ?? h?.effective_at, true)}</span>],
          ['Reason', h?.reason],
          ['Source', source && <span className="mono">{source}</span>],
          ['Authorised by', h?.authorized_by],
          ['Recorded by', h?.recorded_by],
        ]} />
      </Section>

      {spare && (
        <Section title="Spare readiness">
          <KV rows={[
            ['Readiness', b.spareReadiness ?? null],
            ['Last check', fmtDate(b.spareLastCheck)],
            ['Fits', <span className="mono">{b.backsUp.join(', ')}</span>],
          ]} />
        </Section>
      )}

      <Section title="Nameplate">
        <KV rows={[
          ['Manufacturer', a.manufacturer],
          ['Model', a.model],
          ['Serial no.', a.serial_no && <span className="mono">{a.serial_no}</span>],
          ['Rated flow', unit(a.rated_flow_m3h, 'm³/h')],
          ['Rated head', unit(a.rated_head_m, 'm')],
          ['Rated power', unit(a.rated_power_kw, 'kW')],
          ['Speed', unit(a.speed_rpm, 'rpm')],
          ['Installed', a.install_date && <span className="mono">{fmtDate(a.install_date)}{rel.ageDays ? ` · ${(rel.ageDays / 365).toFixed(1)} yr` : ''}</span>],
          ['Expected life', unit(a.expected_life_years, 'yr')],
          ['Criticality', a.criticality],
          ['Duty pattern', a.default_role],
        ]} />
      </Section>
      <ShutdownCost id={id} />
    </>
  );
}

// ---------------------------------------------------------------- readings tab

interface Pt { t: number; v: number }
interface Series { name: string; color: string; pts: Pt[] }

function TrendChart({ title, unit, series, days, limits = [], events = [] }: {
  title: string; unit: string; series: Series[]; days: number; limits?: { v: number; label: string; color: string }[]; events?: { t: number; label: string }[];
}) {
  const all = series.flatMap(s => s.pts.map(p => p.v));
  if (!all.length) return null;
  const W = 340, H = 92, L = 30, R = 6, T = 8, B = 16;
  const x0 = windowStart(days), x1 = windowStart(0);
  const vmax = Math.max(...all);
  const shownLimits = limits.filter(l => l.v <= Math.max(vmax * 1.6, limits[0]?.v ?? 0));
  let lo = Math.min(...all, ...shownLimits.map(l => l.v)), hi = Math.max(...all, ...shownLimits.map(l => l.v));
  const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.1 || 1;
  lo = Math.max(0, lo - pad); hi += pad;
  const sx = (t: number) => L + ((t - x0) / (x1 - x0)) * (W - L - R);
  const sy = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const last = series.map(s => s.pts[s.pts.length - 1]).filter(Boolean);
  return (
    <figure className="trend">
      <figcaption>
        <span>{title} <span className="muted">({unit})</span></span>
        <span className="trend-legend">{series.filter(s => s.pts.length).map(s => <span key={s.name}><i style={{ background: s.color }} />{s.name} <b className="mono">{s.pts[s.pts.length - 1].v.toFixed(1)}</b></span>)}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {[lo, (lo + hi) / 2, hi].map((v, i) => (
          <g key={i}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} className="grid" /><text x={L - 4} y={sy(v) + 3} className="axis" textAnchor="end">{v.toFixed(hi - lo < 5 ? 1 : 0)}</text></g>
        ))}
        {shownLimits.map(l => (
          <g key={l.label}><line x1={L} x2={W - R} y1={sy(l.v)} y2={sy(l.v)} stroke={l.color} strokeDasharray="3 3" strokeWidth={1} opacity={0.8} />
            <text x={W - R - 2} y={sy(l.v) - 2} className="axis" textAnchor="end" fill={l.color}>{l.label}</text></g>
        ))}
        {events.filter(e => e.t >= x0).map((e, i) => (
          <line key={i} x1={sx(e.t)} x2={sx(e.t)} y1={T} y2={H - B} stroke="#f05252" strokeDasharray="2 3" opacity={0.8}><title>{e.label}</title></line>
        ))}
        {series.map(s => s.pts.length > 0 && (
          <path key={s.name} fill="none" stroke={s.color} strokeWidth={1.4} strokeLinejoin="round"
            d={s.pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.t).toFixed(1)},${sy(p.v).toFixed(1)}`).join('')} />
        ))}
        {last.map((p, i) => <circle key={i} cx={sx(p.t)} cy={sy(p.v)} r={2} fill={series[i]?.color} />)}
        <text x={L} y={H - 3} className="axis">{fmtDate(new Date(x0).toISOString().slice(0, 10))}</text>
        <text x={W - R} y={H - 3} className="axis" textAnchor="end">today</text>
      </svg>
    </figure>
  );
}

export function ReadingsTab({ id }: { id: string }) {
  const [days, setDays] = useState(30);
  const checks = checksFor(id, days).filter(c => c.running);
  const rounds = roundsFor(id, days);
  const pts = <T extends { date: string }>(rows: T[], key: keyof T): Pt[] =>
    rows.filter(r => r[key] != null && Number.isFinite(Number(r[key]))).map(r => ({ t: dateMs(r.date), v: Number(r[key]) }));
  const events = failuresFor(id).map(f => ({ t: dateMs(f.failure_at), label: `${f.event_id} · ${f.failure_mode ?? ''}` }));
  const latest = checks[checks.length - 1];
  const charts = [
    <TrendChart key="vib" title="Vibration DE / NDE" unit="mm/s" days={days} events={events}
      series={[{ name: 'DE', color: '#e0e4e7', pts: pts(checks, 'vib_de_mm_s') }, { name: 'NDE', color: '#5fb4ff', pts: pts(checks, 'vib_nde_mm_s') }]}
      limits={[{ v: 2.8, label: 'WATCH 2.8', color: '#d9b46c' }, { v: 4.5, label: 'ALARM 4.5', color: '#e58b3a' }, { v: 7.1, label: 'TRIP 7.1', color: '#e36a5e' }]} />,
    <TrendChart key="temp" title="Bearing temperature" unit="°C" days={days} events={events}
      series={[{ name: 'DE', color: '#e0e4e7', pts: pts(checks, 'temp_de_c') }, { name: 'NDE', color: '#e6a25a', pts: pts(checks, 'temp_nde_c') }]} />,
    <TrendChart key="seal" title="Seal reservoir level" unit="%" days={days}
      series={[{ name: 'Reservoir', color: '#5fb4ff', pts: pts(checks, 'seal_reservoir_level_pct') }]} />,
    <TrendChart key="cur" title="Motor current" unit="A" days={days} events={events}
      series={[{ name: 'Current', color: '#e0e4e7', pts: pts(rounds, 'current_a') }]} />,
    <TrendChart key="flow" title="Flow / discharge pressure" unit="m³/h · bar" days={days}
      series={[{ name: 'Flow', color: '#5fb4ff', pts: pts(rounds, 'flow_m3h') }, { name: 'Pressure', color: '#d9b46c', pts: pts(rounds, 'discharge_pressure_bar') }]} />,
  ];
  const hasAny = checks.length > 0 || rounds.some(r => r.flow_m3h != null || r.current_a != null || r.discharge_pressure_bar != null);
  return (
    <>
      <div className="range" role="group" aria-label="Range">
        {[7, 30, 90].map(d => <button key={d} type="button" className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d}d</button>)}
      </div>
      {latest && (
        <div className="readings">
          {(['vib_de_mm_s', 'vib_nde_mm_s'] as const).map(k => (
            <div key={k} className={`reading z-${vibZone(latest[k])}`}>
              <span className="muted small">{k === 'vib_de_mm_s' ? 'Vibration DE' : 'Vibration NDE'}</span>
              <span className="mono val">{latest[k] == null ? '—' : latest[k]!.toFixed(1)}<small>mm/s</small></span>
            </div>
          ))}
        </div>
      )}
      {hasAny ? charts : <Empty>No running readings for this asset in the last {days} days.</Empty>}
      <p className="muted small">Daily checks (running only) and manual rounds. Red dashed lines mark failures. DE = drive end, NDE = non-drive end.</p>
    </>
  );
}

// ---------------------------------------------------------------- maintenance tab

export function ProcedureModal({ p, assetId, onClose }: { p: Procedure; assetId?: string | null; onClose: () => void }) {
  return (
    <Modal title={`${p.procedure_id} · ${p.title}`} onClose={onClose} width={560} footer={<>
      <button type="button" className="btn" onClick={onClose}>Close</button>
      <button type="button" className="btn primary" onClick={() => { useIntent.getState().setTroubleshoot(p.title, assetId ?? null); navigate('troubleshoot'); onClose(); }}>
        <Icon name="wrench" />Open in Troubleshoot
      </button>
    </>}>
      <KV rows={[
        ['Category', p.category], ['Purpose', p.purpose], ['When used', p.when_used], ['Prerequisites', p.prerequisites],
        ['Skills / crew', [roleWord(p.skills), p.crew_size ? `${p.crew_size} person(s)` : null].filter(Boolean).join(' · ')],
        ['Tools', p.tools], ['PPE', p.ppe], ['Permits', p.permits], ['Parts', p.parts],
        ['Est. time', p.est_time_h != null ? `${p.est_time_h} h` : null], ['Steps', p.step_count], ['Revision', p.revision],
      ]} />
      <ProcExtras id={p.procedure_id} />
    </Modal>
  );
}

export function MaintenanceTab({ id }: { id: string }) {
  const pm = pmFor(id);
  const wos = workOrdersFor(id).slice(0, 8);
  const procs = proceduresFor(id);
  const [proc, setProc] = useState<Procedure | null>(null);
  return (
    <>
      <Section title="PM tasks" aside={pm.length ? `${pm.filter(r => (r.days_until_due ?? 0) < 0).length} overdue · ${pm.length}` : undefined}>
        {pm.length === 0 ? <Empty>No PM tasks recorded.</Empty> : (
          <ul className="pm-list">
            {pm.map(r => {
              const d = r.days_until_due;
              const cls = d != null && d < 0 ? 'overdue' : d != null && d <= 7 ? 'soon' : '';
              return (
                <li key={r.status_id} className={cls}>
                  <span className="pm-task">{r.task}<span className="muted small"> · {r.task_id}{r.asset_id !== id ? ` · ${r.asset_id}` : ''} · last {fmtDate(r.last_done_date)}</span></span>
                  <span className="mono pm-due" title={fmtDate(r.next_due_date)}>{d == null ? '—' : d < 0 ? `${-d}d overdue` : d === 0 ? 'today' : `in ${d}d`}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      <Section title="Work orders" aside={wos.length ? `last ${wos.length}` : undefined}>
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
      </Section>
      <Section title="Linked procedures" aside={procs.length || undefined}>
        {procs.length === 0 ? <Empty>No procedures linked.</Empty> : (
          <ul className="proc-list">
            {procs.map(p => (
              <li key={p.procedure_id}>
                <button type="button" onClick={() => setProc(p)}>
                  <span className="mono muted">{p.procedure_id}</span><span>{p.title}</span><Icon name="chevron" size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {proc && <ProcedureModal p={proc} assetId={id} onClose={() => setProc(null)} />}
    </>
  );
}

// ---------------------------------------------------------------- history tab

export function HistoryTab({ id }: { id: string }) {
  const appended = useStatusStore(s => s.appended);
  const hist = historyFor(id, appended).slice(0, 10);
  const fails = failuresFor(id);
  const irs = incidentsFor(id).slice(0, 6);
  return (
    <>
      <Section title="Status history" aside={hist.length ? `last ${hist.length}` : undefined}>
        {hist.length === 0 ? <Empty>No status changes recorded.</Empty> : (
          <ul className="timeline">
            {hist.map(h => (
              <li key={h.history_id} className={isDown(h.new_status) ? 'down' : ''}>
                <div><span className="mono muted">{fmtDate(h.effective_at, true)}</span> {h.previous_status ? `${h.previous_status} → ` : ''}<b>{h.new_status}</b>{h.data_mode === 'Simulated' && <span className="sim-tag">SIM</span>}</div>
                <div className="muted small">{h.reason ?? '—'}{h.source_id ? ` · ${h.source_id}` : ''}</div>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Failures since install" aside={fails.length}>
        {fails.length === 0 ? <Empty>No failures recorded since installation.</Empty> : (
          <ul className="rec-list">
            {fails.map(f => (
              <li key={f.event_id}>
                <div><span className="mono muted">{fmtDate(f.failure_at)}</span> {f.failure_mode ?? f.symptom}</div>
                {f.root_cause && <div className="small"><span className="muted">Root cause:</span> {f.root_cause}</div>}
                <div className="muted small">{f.symptom}{f.downtime_h ? ` · ${f.downtime_h} h down` : ''}{f.main_wo_id ? ` · ${f.main_wo_id}` : ''}</div>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Incident reports" aside={irs.length || undefined}>
        {irs.length === 0 ? <Empty>No incident reports.</Empty> : (
          <ul className="rec-list">
            {irs.map(r => (
              <li key={r.report_id}>
                <div><span className="mono muted">{r.report_id}</span> {r.severity} <span className="muted small">· {r.status}</span></div>
                <div className="muted small">{fmtDate(r.incident_date)}{r.failure_mode ? ` · ${r.failure_mode}` : ''}</div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- parts tab

export function PartsTab({ id }: { id: string }) {
  const parts = partsFor(id);
  const below = parts.filter(p => p.below_min || p.qty_on_hand < p.min_qty).length;
  return (
    <Section title="Spare parts that fit" aside={parts.length ? `${below} below min · ${parts.length}` : undefined}>
      {parts.length === 0 ? <Empty>No spare parts listed for this asset.</Empty> : (
        <ul className="parts">
          {parts.map(p => {
            const low = p.below_min || p.qty_on_hand < p.min_qty;
            return (
              <li key={p.part_id} className={low ? 'low' : ''}>
                <div className="part-name">{p.part_name}{p.critical && <span className="crit">CRITICAL</span>}</div>
                <div className="part-meta muted small"><span className="mono">{p.part_id}</span>{p.part_number ? ` · ${p.part_number}` : ''} · {p.storage_location ?? '—'}{p.lead_time_days != null ? ` · lead ${p.lead_time_days}d` : ''}</div>
                <div className="part-stock mono"><b>{p.qty_on_hand}</b><span className="muted">/ min {p.min_qty} {p.unit}</span></div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- shells

function AssetInspector({ id, kind }: { id: string; kind: string }) {
  const ctx = useStatusCtx();
  const [tab, setTab] = useState<Tab>('overview');
  const a = assetById.get(id);
  if (!a) return null;
  const v = viewAsset(ctx, id);
  return (
    <>
      <Hero id={id} kind={kind} onOpen={() => { useIntent.getState().setAsset(id); navigate('assets'); }} />
      <div className="insp-head">
        <div className="insp-title"><span className="mono insp-tag">{id}</span><StatusChip v={v} /><RoleChip v={v} /></div>
        <div className="insp-desc">{a.description}</div>
        {a.location_node && <div className="muted small">{a.location_node} · {areaName(a.location_node)}{a.criticality ? ` · criticality ${a.criticality}` : ''}</div>}
      </div>
      <QuickTrends id={id} />
      <nav className="insp-tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>
      <div className="insp-tab">
        {tab === 'overview' && <OverviewTab id={id} v={v} />}
        {tab === 'readings' && <ReadingsTab id={id} />}
        {tab === 'maintenance' && <MaintenanceTab id={id} />}
        {tab === 'history' && <HistoryTab id={id} />}
        {tab === 'parts' && <PartsTab id={id} />}
      </div>
    </>
  );
}

const NODE_TEXT = {
  ok: 'Flowing normally',
  changeover: 'Duty unit down — start the installed standby',
  down: 'Process stopped — both units of the pair are unavailable',
  affected: 'No flow — an upstream process area is down',
};

function AreaInspector({ item, live }: { item: LayoutItem; live: Live }) {
  const node = itemNode(item);
  const ns = node ? live.impact.nodeState[node] ?? 'ok' : 'ok';
  const assets = PLANT.equipment.filter(a => node && a.location_node === node);
  const src = thumbUrl(item.kind);
  return (
    <>
      {src && <div className="insp-hero"><img src={src} alt={item.label} /></div>}
      <div className="insp-head">
        {node && <div className="mono insp-tag">{node}</div>}
        <div className="insp-desc">{item.label}</div>
        <div className="insp-chips"><span className={`chip-status n-${ns}`}><span className="dot" />{NODE_TEXT[ns]}</span></div>
        {node && live.impact.levelRising.has(node) && <div className="warn small">Level rising — downstream transfer stopped</div>}
      </div>
      {assets.length > 0 && (
        <Section title="Equipment in this area">
          <ul className="area-assets">
            {assets.map(a => {
              const v = live.views.get(a.asset_id)!;
              return (
                <li key={a.asset_id}>
                  <button type="button" onClick={() => openAsset(a.asset_id)}>
                    <span className="mono">{a.asset_id}</span><RoleChip v={v} /><span className="muted small">{v.status}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </>
  );
}

export function Inspector({ item, assetId, live }: { item: LayoutItem | null; assetId: string | null; live: Live }) {
  const select = useUi(s => s.select);
  if (!assetId && !item) return null;
  const kind = item?.assetId === assetId && item ? (item.props?.proxy ? kindForAsset(assetId ?? '') : item.kind) : kindForAsset(assetId ?? '');
  return (
    <aside className="inspector" aria-label="Asset inspector">
      <header>
        <span className="muted small">{assetId ? 'Asset inspector' : 'Process area'}</span>
        <button type="button" className="icon-btn" onClick={() => select(null)} aria-label="Close inspector"><Icon name="close" /></button>
      </header>
      <div className="insp-body">
        {assetId ? <AssetInspector key={assetId} id={assetId} kind={kind} /> : item && <AreaInspector item={item} live={live} />}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------- quick trends + procedure extras + shutdown cost
function Spark({ label, unit, vals, warn }: { label: string; unit: string; vals: number[]; warn?: number }) {
  if (vals.length < 2) return <div className="qt"><span className="qt-l">{label}</span><span className="muted small">no data</span></div>;
  const lo = Math.min(...vals, warn ?? Infinity), hi = Math.max(...vals, warn ?? -Infinity), W = 120, H = 30;
  const y = (v: number) => H - 3 - ((v - lo) / (hi - lo || 1)) * (H - 6);
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${y(v)}`).join(' ');
  const last = vals[vals.length - 1], over = warn != null && last >= warn;
  return (
    <div className="qt">
      <span className="qt-l">{label}</span>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="qt-svg">
        {warn != null && <line x1="0" x2={W} y1={y(warn)} y2={y(warn)} className="qt-warn" />}
        <polyline points={pts} className={`qt-line${over ? ' over' : ''}`} />
      </svg>
      <b className={`mono qt-v${over ? ' over' : ''}`}>{last.toFixed(1)}<small> {unit}</small></b>
    </div>
  );
}

function QuickTrends({ id }: { id: string }) {
  const c = checksFor(id, 30), r = roundsFor(id, 30);
  const num = (x: unknown) => (x == null || x === '' ? null : Number(x));
  const series = (rows: Record<string, unknown>[], k: string) => rows.map(x => num(x[k])).filter((x): x is number => x != null && !Number.isNaN(x));
  const vib = series(c as unknown as Record<string, unknown>[], 'vib_de_mm_s'), temp = series(c as unknown as Record<string, unknown>[], 'temp_de_c');
  const flow = series(r as unknown as Record<string, unknown>[], 'flow_m3h'), amps = series(r as unknown as Record<string, unknown>[], 'current_a');
  if (!vib.length && !temp.length && !flow.length && !amps.length) return null;
  return (
    <div className="quick-trends">
      <div className="qt-head"><span>Last 30 days</span></div>
      {!!vib.length && <Spark label="Vibration DE" unit="mm/s" vals={vib} warn={2.8} />}
      {!!temp.length && <Spark label="Bearing temp" unit="°C" vals={temp} warn={80} />}
      {!!flow.length && <Spark label="Flow" unit="m³/h" vals={flow} />}
      {!!amps.length && <Spark label="Current" unit="A" vals={amps} />}
    </div>
  );
}

function ProcExtras({ id }: { id: string }) {
  const kp = OPS.procedureKeyPoints.filter(k => k.procedure_id === id).sort((a, b) => a.point_order - b.point_order);
  const sc = OPS.procedureSelfCheck.filter(k => k.procedure_id === id).sort((a, b) => a.question_order - b.question_order);
  const steps = OPS.procedureSteps.filter(k => k.procedure_id === id).sort((a, b) => a.step_no - b.step_no);
  const figs = OPS.procedureFigures.filter(f => (f as unknown as { procedure_id?: string }).procedure_id === id);
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      {!!kp.length && <div className="proc-kp">{kp.map((k, i) => <div key={i} className={`kp kp-${k.point_type.toLowerCase()}`}><b>{k.point_type}</b> {k.text}</div>)}</div>}
      {!!steps.length && (
        <details className="proc-steps"><summary>Procedure steps ({steps.length})</summary>
          <ol>{steps.map(st => <li key={st.step_no}><span className="muted small">{st.phase}</span> {st.instruction}
            {st.acceptance_criteria && <div className="muted small">Accept: {st.acceptance_criteria}</div>}
            {st.safety_note && <div className="step-safety small">{st.safety_note}</div>}</li>)}</ol>
        </details>
      )}
      {!!figs.length && <div className="proc-figs">{figs.map(f => <figure key={f.figure_id}><img src={`/figures/${f.file_name}`} alt={f.title} loading="lazy" /><figcaption>{f.figure_id} · {f.title}</figcaption></figure>)}</div>}
      {!!sc.length && (
        <div className="proc-sc"><div className="sec-title">Self-check</div>
          {sc.map((q, i) => <button key={i} type="button" className="sc-q" onClick={() => setOpen(open === i ? null : i)}>
            <span>{q.question}</span>{open === i ? <b>{q.answer}</b> : <span className="muted small">Show answer</span>}</button>)}
        </div>
      )}
    </>
  );
}

const GROUP_OF = (id: string) => (/^(P-101|M-101)/.test(id) ? 'Transfer pumps' : /^P-201/.test(id) ? 'Sump pumps' : /^(SC-|VM-)/.test(id) ? 'Screens' : null);

export function ShutdownCost({ id }: { id: string }) {
  const g = GROUP_OF(id);
  if (!g) return null;
  const rows = PLANT.lossScenarios.filter(s => s.asset_group === g);
  if (!rows.length) return null;
  const php = (n: number | string | null) => (n == null ? '—' : `PHP ${Math.round(Number(n)).toLocaleString('en-US')}`);
  return (
    <Section title="Shutdown cost">
      <p className="muted small">What an outage of the {g.toLowerCase()} costs (plant loss scenarios). Loss stays PHP 0 while the standby can take over.</p>
      <table className="mini-table"><thead><tr><th>Scenario</th><th>Hours</th><th>Response</th><th className="num">Loss</th></tr></thead>
        <tbody>{rows.map(s => <tr key={s.scenario_id} className={Number(s.total_loss_php) > 1e6 ? 'hi' : ''}>
          <td>{s.title}</td><td className="mono">{s.outage_h}</td><td>{s.response ?? '—'}</td><td className="num mono">{php(s.total_loss_php)}</td></tr>)}</tbody></table>
    </Section>
  );
}

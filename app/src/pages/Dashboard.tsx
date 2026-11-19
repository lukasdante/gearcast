import { Suspense, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { NOW_DATE, OPS, PLANT } from '../data';
import { checksFor, kindForAsset, pmFor } from '../domain/assetInfo';
import { computeImpact } from '../domain/process';
import { summarize, viewAsset, type AssetView } from '../domain/status';
import { getKind } from '../models/registry';
import { StatusChip, RoleChip } from '../overview/Inspector';
import { useStatusCtx } from '../store/statusStore';
import { useIntent } from '../store/intentStore';
import { navigate } from '../store/route';
import { openAsset } from '../shell/TopBar';
import { Icon } from '../shell/icons';
import { buildRows, type Band } from './PmMonitoring';
import { Ring, partCheck, partLevel, unitCheck, unitLevel, useChecks } from './SpareReadiness';
import '../styles/pages.css';

const DAY = 86400000;
const dms = (d: string) => new Date(d.slice(0, 10) + 'T12:00:00').getTime();
const TODAY = dms(NOW_DATE);
const short = (d: string) => { const [y, m, dd] = d.slice(0, 10).split('-'); return `${m}/${dd}/${y.slice(2)}`; };
const php = (n: number) => (n >= 1e6 ? `₱${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `₱${Math.round(n / 1e3)}k` : `₱${Math.round(n)}`);
const VIB_WARN = 2.8;

interface Attention { v: AssetView; score: number; reasons: string[] }

function pickAttention(views: AssetView[]): Attention[] {
  return views.filter(v => v.key !== 'stored').map(v => {
    const reasons: string[] = []; let score = 0;
    if (v.key === 'fault') { score += 100; reasons.push(v.status === 'Not Available' ? 'Not available (driver down)' : 'Shut down'); }
    if (v.key === 'maintenance') { score += 80; reasons.push('Under maintenance'); }
    if (v.key === 'startNeeded') { score += 70; reasons.push('Standby must start'); }
    const c = checksFor(v.id, 7).filter(x => x.vib_de_mm_s != null).slice(-1)[0];
    const vib = c ? Number(c.vib_de_mm_s) : 0;
    if (vib >= VIB_WARN) { score += 60 + vib; reasons.push(`Vibration ${vib.toFixed(1)} mm/s ≥ ${VIB_WARN}`); } else score += vib;
    const overdue = pmFor(v.id).filter(r => (r.days_until_due ?? 0) < 0).length;
    if (overdue) { score += 40 + overdue; reasons.push(`${overdue} PM task(s) overdue`); }
    if (v.asset?.criticality === 'A') score += 2;
    if (!reasons.length) reasons.push(vib ? `Highest vibration on site (${vib.toFixed(1)} mm/s)` : 'Most critical duty unit');
    return { v, score, reasons };
  }).sort((a, b) => b.score - a.score);
}

export function Dashboard() {
  const ctx = useStatusCtx();
  const checks = useChecks(s => s.m);
  const views = useMemo(() => PLANT.equipment.map(a => viewAsset(ctx, a.asset_id)), [ctx]);
  const sum = summarize(ctx);
  const impact = computeImpact(ctx);
  const ranked = useMemo(() => pickAttention(views), [views]);
  const [pick, setPick] = useState(0);
  const att = ranked[Math.min(pick, ranked.length - 1)];
  const pm = useMemo(buildRows, []);

  // KPIs
  const installed = views.filter(v => v.key !== 'stored');
  const avail = installed.filter(v => v.key === 'running' || v.key === 'standby').length;
  const pmOver = pm.filter(r => r.band === 'overdue').length, pmWeek = pm.filter(r => r.days >= 0 && r.days <= 7).length;
  const parts = OPS.spareInventory;
  const low = parts.filter(p => partLevel(p, partCheck(checks, p)).tone !== 'ok');
  const units = OPS.spareSummary;
  const unitsReady = units.filter(u => unitLevel(u, unitCheck(checks, u)).tone === 'ok').length;
  const yr = OPS.failures.filter(f => dms(String(f.failure_at)) >= TODAY - 365 * DAY);
  const cost12 = yr.reduce((s, f) => s + Number((f as unknown as { repair_cost_php?: number }).repair_cost_php ?? 0), 0);
  const down90 = OPS.failures.filter(f => dms(String(f.failure_at)) >= TODAY - 90 * DAY)
    .reduce((s, f) => s + Number(f.downtime_h ?? 0), 0);

  const spareAlerts = [
    ...units.map(u => ({ id: u.asset_id, name: `Stored spare ${u.asset_id}`, lv: unitLevel(u, unitCheck(checks, u)), sub: u.spare_type })),
    ...parts.map(p => ({ id: p.part_id, name: p.part_name, lv: partLevel(p, partCheck(checks, p)), sub: `${p.qty_on_hand}/${p.min_qty} ${p.unit} · ${p.fits_assets.split(';')[0]}…` })),
  ].filter(x => x.lv.tone !== 'ok').sort((a, b) => (a.lv.tone === 'bad' ? 0 : 1) - (b.lv.tone === 'bad' ? 0 : 1));

  const incidents = [...OPS.incidentReports].sort((a, b) => b.incident_date.localeCompare(a.incident_date)).slice(0, 5);
  const watch = installed.map(v => ({ v, c: checksFor(v.id, 7).filter(x => x.vib_de_mm_s != null).slice(-1)[0] }))
    .filter(x => x.c).sort((a, b) => Number(b.c!.vib_de_mm_s) - Number(a.c!.vib_de_mm_s)).slice(0, 5);
  const nodes = PLANT.nodes.filter(n => /^W0\d$/.test(n.node_id)).sort((a, b) => a.node_id.localeCompare(b.node_id));

  return (
    <div className="page dash">
      <div className="dash-kpis">
        <Kpi label="Asset availability" value={`${Math.round((avail / Math.max(1, installed.length)) * 100)}%`} sub={`${avail}/${installed.length} installed units available`} tone={avail === installed.length ? 'ok' : 'warn'} />
        <Kpi label="Active alarms" value={String(sum.fault)} sub={`${sum.maintenance} in maintenance`} tone={sum.fault ? 'bad' : 'ok'} onClick={() => navigate('overview')} />
        <Kpi label="PM overdue" value={String(pmOver)} sub={`${pmWeek} due in the next 7 days`} tone={pmOver ? 'bad' : pmWeek ? 'warn' : 'ok'} onClick={() => navigate('pm')} />
        <Kpi label="Spares needing action" value={String(low.length)} sub={`${unitsReady}/${units.length} stored spares ready`} tone={low.some(p => partLevel(p, partCheck(checks, p)).tone === 'bad') ? 'bad' : low.length ? 'warn' : 'ok'} onClick={() => navigate('spares')} />
        <Kpi label="Failures · 12 months" value={String(yr.length)} sub={`${down90} h asset downtime in 90 days`} />
        <Kpi label="Repair cost · 12 months" value={php(cost12)} sub="from failure records" onClick={() => navigate('rr')} />
      </div>

      <div className="dash-process card">
        <span className="dash-cap">Process</span>
        {nodes.map((n, i) => {
          const st = impact.nodeState[n.node_id] ?? 'ok';
          return (
            <span key={n.node_id} className="dp-wrap">
              {i > 0 && <i className={`dp-arrow ${st}`} />}
              <span className={`dp-node ${st}`} title={n.node_name}><b className="mono">{n.node_id}</b> {n.node_name.replace(/^.*?–\s*/, '').slice(0, 22)}</span>
            </span>
          );
        })}
      </div>

      <div className="dash-grid">
        {att && (
          <section className="card dash-att">
            <header className="dash-h">
              <span>Needs attention</span>
              <span className="dash-pager">
                {ranked.slice(0, 4).map((r, i) => <button key={r.v.id} type="button" className={i === pick ? 'on' : ''} onClick={() => setPick(i)}>{r.v.id}</button>)}
              </span>
            </header>
            <div className="dash-3d">
              <Canvas shadows dpr={[1, 2]} camera={{ position: [2.4, 1.6, 2.8], fov: 35 }} key={att.v.id}>
                <hemisphereLight args={['#cfe3ff', '#1a2129', 0.6]} />
                <directionalLight position={[4, 6, 3]} intensity={1.6} castShadow />
                <Environment resolution={64}><Lightformer intensity={2} position={[0, 4, 4]} scale={[6, 3, 1]} /><Lightformer intensity={1} position={[-4, 2, -2]} scale={[4, 2, 1]} /></Environment>
                <Suspense fallback={null}><AttModel v={att.v} /></Suspense>
                <ContactShadows position={[0, 0, 0]} opacity={0.5} scale={8} blur={2.4} far={3} />
                <OrbitControls autoRotate autoRotateSpeed={0.8} enablePan={false} enableZoom={false} minPolarAngle={0.6} maxPolarAngle={1.3} />
              </Canvas>
            </div>
            <div className="dash-att-info">
              <div className="insp-title"><span className="mono insp-tag">{att.v.id}</span><StatusChip v={att.v} /><RoleChip v={att.v} /></div>
              <div className="muted small">{att.v.asset?.description}</div>
              <ul className="dash-reasons">{att.reasons.map(r => <li key={r}><Icon name="incidents" size={12} />{r}</li>)}</ul>
              <div className="q-actions">
                <button type="button" className="btn sm" onClick={() => openAsset(att.v.id)}><Icon name="plant" size={13} />On plant</button>
                <button type="button" className="btn sm" onClick={() => { useIntent.getState().setAsset(att.v.id); navigate('assets'); }}><Icon name="assets" size={13} />Asset details</button>
                <button type="button" className="btn sm" onClick={() => { useIntent.getState().setTroubleshoot(att.reasons[0], att.v.id); navigate('troubleshoot'); }}><Icon name="wrench" size={13} />Troubleshoot</button>
              </div>
            </div>
          </section>
        )}

        <section className="card dash-cal">
          <header className="dash-h"><span>PM calendar</span><button type="button" className="link small" onClick={() => navigate('pm')}>Open PM ›</button></header>
          <MiniCalendar rows={pm} />
        </section>

        <section className="card dash-list">
          <header className="dash-h"><span>Spare parts alerts</span><span className="badge warn">{spareAlerts.length}</span></header>
          <div className="dash-scroll">
            {spareAlerts.length ? spareAlerts.map(x => (
              <button key={x.id} type="button" className="dash-row" onClick={() => navigate('spares')}>
                <Ring {...x.lv} /><span className="dash-row-t"><b>{x.name}</b><span className="muted small">{x.lv.label} · {x.sub}</span></span>
              </button>
            )) : <p className="muted small">All spares ready and stocked.</p>}
          </div>
        </section>

        <section className="card dash-list">
          <header className="dash-h"><span>Condition watch · vibration DE</span></header>
          <div className="dash-scroll">
            {watch.map(({ v, c }) => {
              const vib = Number(c!.vib_de_mm_s), pct = Math.min(1, vib / 4.5);
              return (
                <button key={v.id} type="button" className="dash-row" onClick={() => { useIntent.getState().setAsset(v.id); navigate('assets'); }}>
                  <b className="mono dash-tag">{v.id}</b>
                  <span className="dash-meter"><i style={{ width: `${pct * 100}%` }} className={vib >= VIB_WARN ? 'over' : ''} /><em style={{ left: `${(VIB_WARN / 4.5) * 100}%` }} /></span>
                  <b className={`mono ${vib >= VIB_WARN ? 'bad-t' : ''}`}>{vib.toFixed(1)}</b>
                </button>
              );
            })}
          </div>
        </section>

        <section className="card dash-list">
          <header className="dash-h"><span>Recent incidents</span><button type="button" className="link small" onClick={() => navigate('incidents')}>All ›</button></header>
          <div className="dash-scroll">
            {incidents.map(r => (
              <button key={r.report_id} type="button" className="dash-row" onClick={() => navigate('incidents')}>
                <span className={`sev sev-${String(r.severity ?? '').toLowerCase().replace(' ', '-')}`}>{r.severity}</span>
                <span className="dash-row-t"><b>{r.failure_mode || 'Near miss'}</b><span className="muted small mono">{r.asset_id} · {short(r.incident_date)}</span></span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function AttModel({ v }: { v: AssetView }) {
  const k = getKind(kindForAsset(v.id));
  const s = 1.6 / Math.max(k.footprint[0], k.footprint[1], k.height);
  return <group scale={s} position={[0, 0, 0]}><k.Component state={v.visual} statusColor={v.color} /></group>;
}

function Kpi({ label, value, sub, tone, onClick }: { label: string; value: string; sub: string; tone?: 'ok' | 'warn' | 'bad'; onClick?: () => void }) {
  return (
    <button type="button" className={`card dash-kpi ${tone ?? ''}`} onClick={onClick} disabled={!onClick}>
      <span className="dash-kpi-l">{label}</span>
      <b className="dash-kpi-v">{value}</b>
      <span className="dash-kpi-s">{sub}</span>
    </button>
  );
}

function MiniCalendar({ rows }: { rows: { due: string; band: Band }[] }) {
  const t = new Date(TODAY), first = new Date(t.getFullYear(), t.getMonth(), 1);
  const start = new Date(first.getTime() - ((first.getDay() + 6) % 7) * DAY);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const by = new Map<string, Band[]>();
  for (const r of rows) by.set(r.due, [...(by.get(r.due) ?? []), r.band]);
  const order: Band[] = ['overdue', 'due', 'soon', 'later'];
  return (
    <div className="mini-cal">
      <div className="mini-cal-m">{t.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</div>
      <div className="mini-cal-g">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="mc-dow">{d}</span>)}
        {Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * DAY)).map(d => {
          const k = iso(d), b = by.get(k) ?? [], worst = order.find(o => b.includes(o));
          return (
            <span key={k} className={`mc-d${d.getMonth() !== t.getMonth() ? ' out' : ''}${k === NOW_DATE ? ' today' : ''}${worst ? ` b-${worst}` : ''}`} title={b.length ? `${b.length} PM task(s)` : undefined}>
              {d.getDate()}{b.length > 0 && <i>{b.length}</i>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

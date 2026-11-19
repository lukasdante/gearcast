/** Right-hand Asset Inspector — port of the prototype's renderAssetPanelImpl. */
import type { ReactNode } from 'react';
import { PLANT, assetById } from '../data';
import { backupInfo, changeoverOffer, isDown, viewAsset, type AssetView } from '../domain/status';
import {
  dailyChecksFor, failuresFor, figureFor, fmtDate, latestHistory, pmFor, vibZone, workOrdersFor,
} from '../domain/assetInfo';
import { areaName, itemNode, type LayoutItem } from '../domain/layout';
import { useStatusCtx, useStatusStore } from '../store/statusStore';
import { useUi } from '../store/uiStore';
import { Icon } from '../shell/icons';
import { openAsset } from '../shell/TopBar';
import type { Live } from './live';

const seedStatus = new Map(PLANT.equipmentStatus.map(s => [s.asset_id, s.current_status]));

export function StatusChip({ v }: { v: AssetView }) {
  return <span className={`chip-status k-${v.key}`}><span className="dot" />{v.status}</span>;
}
export function RoleChip({ v }: { v: AssetView }) {
  return <span className={`chip-role k-${v.key}`}>{v.chip}</span>;
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="insp-sec">
      <h3>{title}{aside && <span className="muted">{aside}</span>}</h3>
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

function Spark({ values, color }: { values: (number | null)[]; color: string }) {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (pts.length < 2) return <svg className="spark" viewBox="0 0 80 22" />;
  const ys = pts.map(p => p[1]);
  const lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
  const n = Math.max(1, values.length - 1);
  const d = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${((i / n) * 78 + 1).toFixed(1)},${(20 - ((v - lo) / span) * 18).toFixed(1)}`).join('');
  const [li, lv] = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox="0 0 80 22" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx={(li / n) * 78 + 1} cy={20 - ((lv - lo) / span) * 18} r="1.8" fill={color} />
    </svg>
  );
}

function Readings({ id }: { id: string }) {
  const rows = dailyChecksFor(id, 30);
  if (!rows.length) return <p className="muted small">No daily-check readings for this asset in the last 30 days.</p>;
  const last = rows[rows.length - 1];
  const metric = (label: string, key: 'vib_de_mm_s' | 'vib_nde_mm_s' | 'temp_de_c' | 'temp_nde_c', unit: string) => {
    const v = last[key];
    const zone = key.startsWith('vib') ? vibZone(v) : 'na';
    return (
      <div className={`reading z-${zone}`} key={key}>
        <span className="muted small">{label}</span>
        <span className="mono val">{v == null ? '—' : v.toFixed(1)}<small>{unit}</small></span>
        <Spark values={rows.map(r => r[key])} color={key.startsWith('vib') ? '#5fb4ff' : '#e6a25a'} />
      </div>
    );
  };
  return (
    <>
      <div className="readings">
        {metric('Vibration DE', 'vib_de_mm_s', 'mm/s')}
        {metric('Vibration NDE', 'vib_nde_mm_s', 'mm/s')}
        {metric('Temp DE', 'temp_de_c', '°C')}
        {metric('Temp NDE', 'temp_nde_c', '°C')}
      </div>
      <p className="muted small">Latest running check {fmtDate(last.date)} · 30-day trend · ISO 10816 zones 2.8 / 4.5 / 7.1 mm/s</p>
    </>
  );
}

function Actions({ id, v }: { id: string; v: AssetView }) {
  const ctx = useStatusCtx();
  const setStatus = useStatusStore(s => s.setStatus);
  const switchDuty = useStatusStore(s => s.switchDuty);
  const own = ctx.statusById[id]?.current_status ?? '';
  const offer = changeoverOffer(ctx, id);
  const stored = v.key === 'stored';
  const simulated = own === 'Shut Down';
  const restore = seedStatus.get(id) && !isDown(seedStatus.get(id)!) ? seedStatus.get(id)! : 'In Service';
  return (
    <Section title="Simulation">
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
        <button type="button" className="btn danger sm" disabled={stored || simulated}
          onClick={() => setStatus(id, 'Shut Down', 'Simulated fault (Plant Overview)')}>
          <Icon name="bolt" />Simulate fault
        </button>
        <button type="button" className="btn sm" disabled={!simulated}
          onClick={() => setStatus(id, restore, 'Simulated fault cleared')}>
          <Icon name="check" />Clear
        </button>
      </div>
      <p className="muted small note">
        Simulation only. In the real flow an incident report is required before an asset is taken out of service.
      </p>
    </Section>
  );
}

function AssetInspector({ id }: { id: string }) {
  const ctx = useStatusCtx();
  const appended = useStatusStore(s => s.appended);
  const a = assetById.get(id);
  if (!a) return null;
  const v = viewAsset(ctx, id);
  const fig = figureFor(id);
  const b = backupInfo(ctx, id);
  const h = latestHistory(id, appended);
  const st = ctx.statusById[id];
  const pm = pmFor(id);
  const fails = failuresFor(id).slice(0, 5);
  const wos = workOrdersFor(id).slice(0, 5);
  const unit = (x: string | null, u: string) => (x ? <span className="mono">{x} {u}</span> : null);
  const source = h?.source_type && h?.source_id ? `${h.source_type} ${h.source_id}` : h?.source_type || h?.source_id || null;

  return (
    <>
      {fig && (
        <figure className="insp-fig">
          <img src={fig.src} alt={fig.title} />
          <figcaption><span>{fig.title}</span><em>Illustrative</em></figcaption>
        </figure>
      )}
      <div className="insp-head">
        <div className="mono insp-tag">{id}</div>
        <div className="insp-desc">{a.description}</div>
        <div className="insp-chips"><StatusChip v={v} /><RoleChip v={v} />{a.criticality && <span className="chip-crit">Crit. {a.criticality}</span>}</div>
        {a.location_node && <div className="muted small">{a.location_node} · {areaName(a.location_node)}</div>}
      </div>

      <div className={`backup${b.partner && isDown(b.partner.status) ? ' bad' : ''}`}>
        <Icon name="layers" />
        <div>
          {b.partner && <div>Partner <b className="mono">{b.partner.id}</b> <RoleChip v={b.partner} /> <span className="muted">{b.partner.status}</span></div>}
          {b.spareId && <div>Stored spare <b className="mono">{b.spareId}</b> <span className={b.spareReadiness === 'Ready' ? 'ok' : 'warn'}>{b.spareReadiness ?? 'Not checked'}</span> <span className="muted">· checked {fmtDate(b.spareLastCheck)}</span></div>}
          {b.backsUp.length > 0 && <div>Backs up <span className="mono">{b.backsUp.join(', ')}</span></div>}
          {!b.partner && !b.spareId && !b.backsUp.length && <div className="muted">No installed standby or stored spare recorded</div>}
        </div>
      </div>

      <Actions id={id} v={v} />

      <Section title="Current status">
        <KV rows={[
          ['Since', <span className="mono">{fmtDate(st?.status_since ?? h?.effective_at, true)}</span>],
          ['Reason', h?.reason],
          ['Source', source && <span className="mono">{source}</span>],
          ['Authorised by', h?.authorized_by],
          ['Recorded by', h?.recorded_by],
        ]} />
      </Section>

      <Section title="Asset details">
        <KV rows={[
          ['Manufacturer', a.manufacturer],
          ['Model', a.model],
          ['Rated flow', unit(a.rated_flow_m3h, 'm³/h')],
          ['Rated head', unit(a.rated_head_m, 'm')],
          ['Rated power', unit(a.rated_power_kw, 'kW')],
          ['Speed', unit(a.speed_rpm, 'rpm')],
          ['Installed', a.install_date && <span className="mono">{fmtDate(a.install_date)}</span>],
          ['Criticality', a.criticality],
          ['Expected life', unit(a.expected_life_years, 'yr')],
        ]} />
      </Section>

      <Section title="Next PM tasks" aside={pm.length ? `${pm.length}` : undefined}>
        {pm.length === 0 ? <p className="muted small">No PM tasks recorded.</p> : (
          <ul className="pm-list">
            {pm.map(r => {
              const d = r.days_until_due;
              const cls = d != null && d < 0 ? 'overdue' : d != null && d <= 7 ? 'soon' : '';
              return (
                <li key={r.status_id} className={cls}>
                  <span className="pm-task">{r.task}{r.asset_id !== id && <span className="muted small"> · {r.asset_id}</span>}</span>
                  <span className="mono pm-due">{d == null ? '—' : d < 0 ? `${-d}d overdue` : d === 0 ? 'today' : `in ${d}d`}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Recent failures" aside={fails.length ? `last ${fails.length}` : undefined}>
        {fails.length === 0 ? <p className="muted small">No failures recorded since installation.</p> : (
          <ul className="rec-list">
            {fails.map(f => (
              <li key={f.event_id}>
                <div><span className="mono muted">{fmtDate(f.failure_at)}</span> {f.symptom}</div>
                <div className="muted small">{f.failure_mode}{f.downtime_h ? ` · ${f.downtime_h} h down` : ''}{f.main_wo_id ? ` · ${f.main_wo_id}` : ''}</div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Work orders" aside={wos.length ? `last ${wos.length}` : undefined}>
        {wos.length === 0 ? <p className="muted small">No work orders.</p> : (
          <ul className="rec-list">
            {wos.map(w => (
              <li key={w.wo_id}>
                <div><span className="mono muted">{w.wo_id}</span> {w.title}</div>
                <div className="muted small">{fmtDate(w.reported_at)} · {w.wo_type} · {w.priority} · {w.status}</div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Daily check readings">
        <Readings id={id} />
      </Section>
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
  return (
    <>
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
  return (
    <aside className="inspector" aria-label="Asset inspector">
      <header>
        <span className="muted small">{assetId ? 'Asset' : 'Process area'}</span>
        <button type="button" className="icon-btn" onClick={() => select(null)} aria-label="Close inspector"><Icon name="close" /></button>
      </header>
      <div className="insp-body">
        {assetId ? <AssetInspector id={assetId} /> : item && <AreaInspector item={item} live={live} />}
      </div>
    </aside>
  );
}

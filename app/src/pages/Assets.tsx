import { useMemo, useState } from 'react';
import { PLANT } from '../data';
import { kindForAsset } from '../domain/assetInfo';
import { areaName } from '../domain/layout';
import { viewAsset } from '../domain/status';
import { HistoryTab, MaintenanceTab, OverviewTab, PartsTab, ReadingsTab, RoleChip, StatusChip, Hero } from '../overview/Inspector';
import { thumbUrl } from '../overview/thumbs';
import { useStatusCtx } from '../store/statusStore';
import '../styles/pages.css';

type Tab = 'maintenance' | 'history' | 'parts';
const TABS: [Tab, string][] = [['maintenance', 'Maintenance'], ['history', 'History'], ['parts', 'Parts']];

export function Assets() {
  const ctx = useStatusCtx();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(PLANT.equipment[0]?.asset_id ?? '');
  const [tab, setTab] = useState<Tab>('maintenance');
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return PLANT.equipment.filter(a => !t || [a.asset_id, a.description, a.asset_type, a.manufacturer, a.model].some(v => String(v ?? '').toLowerCase().includes(t)));
  }, [q]);
  const a = PLANT.equipment.find(x => x.asset_id === sel);
  const v = a ? viewAsset(ctx, a.asset_id) : null;

  return (
    <div className="page as-page">
      <header className="page-head">
        <h1>Assets</h1>
        <p>Every tracked asset with its condition trends, maintenance and history.</p>
      </header>
      <div className="as-layout">
        <div className="as-list card">
          <input className="sp-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search assets…" aria-label="Search assets" />
          {list.map(x => {
            const xv = viewAsset(ctx, x.asset_id), img = thumbUrl(kindForAsset(x.asset_id));
            return (
              <button key={x.asset_id} type="button" className={`as-item${sel === x.asset_id ? ' on' : ''}`} onClick={() => setSel(x.asset_id)}>
                <span className="as-thumb">{img && <img src={img} alt="" loading="lazy" />}</span>
                <span className="as-txt">
                  <span className="as-row"><b className="mono">{x.asset_id}</b><StatusChip v={xv} /></span>
                  <span className="muted small as-desc">{x.description}</span>
                </span>
              </button>
            );
          })}
        </div>

        {a && v && (
          <div className="as-detail" key={a.asset_id}>
            <div className="as-top">
              <div className="card as-card">
                <Hero id={a.asset_id} kind={kindForAsset(a.asset_id)} />
                <div className="insp-head">
                  <div className="insp-title"><span className="mono insp-tag">{a.asset_id}</span><StatusChip v={v} /><RoleChip v={v} /></div>
                  <div className="insp-desc">{a.description}</div>
                  <div className="muted small">{a.location_node ? `${a.location_node} · ${areaName(a.location_node)}` : 'Spares store'}{a.criticality ? ` · criticality ${a.criticality}` : ''}</div>
                </div>
                <OverviewTab id={a.asset_id} v={v} />
              </div>
              <div className="card as-card as-charts">
                <ReadingsTab id={a.asset_id} />
              </div>
            </div>
            <div className="card as-card">
              <nav className="insp-tabs" role="tablist">
                {TABS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>)}
              </nav>
              {tab === 'maintenance' && <MaintenanceTab id={a.asset_id} />}
              {tab === 'history' && <HistoryTab id={a.asset_id} />}
              {tab === 'parts' && <PartsTab id={a.asset_id} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

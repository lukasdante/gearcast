import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { assetById, plantName } from '../data';
import { useStatusCtx, useStatusStore } from '../store/statusStore';
import { usePlantStore } from '../store/plantStore';
import { useUi } from '../store/uiStore';
import { navigate } from '../store/route';
import { useAuth } from '../store/authStore';
import { fmtDate, nowStamp } from '../domain/assetInfo';

/** Live "data as of" clock (the dataset is shifted to today; see data/index.ts). */
function AsOf() {
  const [now, setNow] = useState(nowStamp);
  useEffect(() => { const t = window.setInterval(() => setNow(nowStamp()), 15000); return () => window.clearInterval(t); }, []);
  return <span className="asof">Data as of <span className="mono">{fmtDate(now, true)}</span></span>;
}

export function openAsset(assetId: string) {
  const { plants, activeId } = usePlantStore.getState();
  const item = plants[activeId]?.items.find(i => i.assetId === assetId);
  useUi.getState().setEditMode(false);
  useUi.getState().select(item?.id ?? null, assetId);
  navigate('overview');
}

export function TopBar() {
  const ctx = useStatusCtx();
  const acked = useStatusStore(s => s.acked);
  const ack = useStatusStore(s => s.ack);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const alarms = Object.values(ctx.statusById).filter(s => s.current_status === 'Shut Down');
  const unacked = alarms.filter(a => !acked.includes(a.asset_id)).length;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 2.5l2 2.6 3.2-.6.6 3.2 2.7 1.9-1.4 3 1.4 3-2.7 1.9-.6 3.2-3.2-.6-2 2.6-2-2.6-3.2.6-.6-3.2L3.5 15.4l1.4-3-1.4-3 2.7-1.9.6-3.2 3.2.6z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><circle cx="12" cy="12" r="3.2" fill="currentColor" /></svg></span>
        <span className="brand-name">Gear<b>Cast</b></span>
      </div>
      <div className="topbar-plant">
        <span className="plant-name" title={plantName}>{plantName}</span>
        <span className="sep" />
        <AsOf />
      </div>
      <div className="topbar-right">
        <UserChip />
        <span className="sim-badge" title="Statuses are recorded / simulated from the workbook, not a live SCADA feed">
          <span className="dot" />Simulated status — not live SCADA
        </span>
        <div className="alarm-wrap" ref={ref}>
          <button type="button" className={`bell${alarms.length ? ' has' : ''}${unacked ? ' unacked' : ''}`} onClick={() => setOpen(o => !o)}
            aria-label={`${alarms.length} alarms`} aria-expanded={open}>
            <Icon name="bell" size={18} />
            {alarms.length > 0 && <span className="bell-count mono">{alarms.length}</span>}
          </button>
          {open && (
            <div className="alarm-panel" role="dialog" aria-label="Alarms">
              <header><b>Alarms</b><span className="muted">{alarms.length ? `${alarms.length} shut down · ${unacked} unacknowledged` : 'No active alarms'}</span></header>
              {alarms.length === 0 && <p className="alarm-empty">All tracked assets are available.</p>}
              {alarms.map(a => {
                const isAck = acked.includes(a.asset_id);
                return (
                  <div key={a.asset_id} className={`alarm-row${isAck ? ' acked' : ''}`}>
                    <span className="alarm-dot" />
                    <div className="alarm-text">
                      <div><span className="mono tag">{a.asset_id}</span> <span className="alarm-status">Shut down</span></div>
                      <div className="muted small">{assetById.get(a.asset_id)?.description} · since {fmtDate(a.status_since, true)}</div>
                    </div>
                    <div className="alarm-actions">
                      <button type="button" className="btn sm" onClick={() => { openAsset(a.asset_id); setOpen(false); }}>Open</button>
                      <button type="button" className="btn sm ghost" disabled={isAck} onClick={() => ack(a.asset_id)}>{isAck ? 'Acked' : 'Ack'}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function UserChip() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <span className="user-chip" title={user.name}>
      <span><b>{user.username}</b> · {user.role === 'technician' ? 'Technician' : 'Operator'}</span>
      <button type="button" className="btn sm ghost" onClick={() => logout()}>Sign out</button>
    </span>
  );
}

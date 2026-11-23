/** Plant Supervisor: give personnel access to other plants — temporary (emergency) or assigned until revoked. */
import { useEffect, useState } from 'react';
import { Modal } from '../shell/Modal';
import { del, getJSON, postJSON } from '../api/client';
import { usePlantStore } from '../store/plantStore';
import { isPublished, syncPlants } from '../api/plants';
import { ROLE_LABEL, type Role } from '../store/authStore';

interface Grant { username: string; plant_id: string; expires_at: string | null; granted_by: string; granted_at: string; reason: string | null; active: boolean }
const DURATIONS = [{ h: 8, l: '8 hours (shift)' }, { h: 24, l: '24 hours' }, { h: 72, l: '3 days' }, { h: 168, l: '7 days' }, { h: 0, l: 'Assigned (until revoked)' }];

export function AccessModal({ onClose }: { onClose: () => void }) {
  const plants = usePlantStore(s => s.plants);
  const order = usePlantStore(s => s.order);
  const others = order.filter(id => id !== 'default' && plants[id]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [users, setUsers] = useState<{ username: string; role: Role; name: string }[]>([]);
  const [f, setF] = useState({ username: '', plant_id: others[0] ?? '', hours: 24, reason: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => getJSON<{ grants: Grant[]; users: { username: string; role: Role; name: string }[] }>('/api/plants/access')
    .then(r => { setGrants(r.grants); setUsers(r.users); setF(x => ({ ...x, username: x.username || r.users.find(u => u.role !== 'supervisor')?.username || '' })); })
    .catch(e => setErr(e instanceof Error ? e.message : 'Could not load access'));
  useEffect(() => { load(); }, []);
  const name = (id: string) => plants[id]?.name ?? id;
  const give = async () => {
    if (!f.username || !f.plant_id) { setErr('Pick a person and a plant'); return; }
    if (!isPublished(f.plant_id)) { setErr('That plant has no shared layout yet — open it and make an edit first.'); return; }
    setBusy(true); setErr(null);
    try { await postJSON('/api/plants/access', f); await load(); await syncPlants(); setF(x => ({ ...x, reason: '' })); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  };
  const revoke = async (g: Grant) => { await del(`/api/plants/access?username=${encodeURIComponent(g.username)}&plant_id=${encodeURIComponent(g.plant_id)}`).catch(() => {}); load(); };
  return (
    <Modal title="Plant access" onClose={onClose} width={560} footer={<button type="button" className="btn" onClick={onClose}>Close</button>}>
      <p className="muted small">Everyone works on the home plant. Give someone access to another plant — for an emergency, with an expiry, or as a standing assignment.</p>
      {others.length ? (
        <div className="access-form">
          <label>Person<select value={f.username} onChange={e => setF({ ...f, username: e.target.value })}>
            {users.filter(u => u.role !== 'supervisor').map(u => <option key={u.username} value={u.username}>{u.username} · {ROLE_LABEL[u.role] ?? u.role}</option>)}</select></label>
          <label>Plant<select value={f.plant_id} onChange={e => setF({ ...f, plant_id: e.target.value })}>{others.map(id => <option key={id} value={id}>{name(id)}</option>)}</select></label>
          <label>Duration<select value={f.hours} onChange={e => setF({ ...f, hours: Number(e.target.value) })}>{DURATIONS.map(d => <option key={d.h} value={d.h}>{d.l}</option>)}</select></label>
          <label>Reason<input value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} placeholder="e.g. Emergency cover – P-301A down" /></label>
          <div><button type="button" className="btn primary sm" disabled={busy} onClick={give}>Give access</button></div>
        </div>
      ) : <p className="small">Create another plant first (Plants menu → New plant).</p>}
      {err && <div className="alert-box bad">{err}</div>}
      <div className="access-list">
        {grants.map(g => (
          <div key={g.username + g.plant_id} className="access-row">
            <b className="mono">{g.username}</b><span>{name(g.plant_id)}</span>
            <span className={`muted small${g.active ? '' : ' bad-t'}`}>{g.expires_at ? `${g.active ? 'until' : 'expired'} ${g.expires_at}` : 'assigned'}{g.reason ? ` · ${g.reason}` : ''} · by {g.granted_by}</span>
            <button type="button" className="btn ghost sm" onClick={() => revoke(g)}>Revoke</button>
          </div>
        ))}
        {!grants.length && <p className="muted small">No access granted yet.</p>}
      </div>
    </Modal>
  );
}

import { useMemo, useState } from 'react';
import { NOW_DATE, OPS } from '../data';
import { thumbUrl } from '../overview/thumbs';
import { openAsset } from '../shell/TopBar';
import { Modal } from '../shell/Modal';
import { Icon } from '../shell/icons';
import type { SparePart, SpareSummary } from '../data';
import '../styles/pages.css';

const GROUPS = [
  { name: 'EQ transfer pumps', assets: ['P-101A', 'P-101B'], kind: 'pump_end_suction', spare: 'SP-P01' },
  { name: 'Transfer pump motors', assets: ['M-101A', 'M-101B'], kind: 'motor', spare: 'SP-M01' },
  { name: 'Sump pumps', assets: ['P-201A', 'P-201B'], kind: 'pump_submersible', spare: 'SP-P02' },
  { name: 'Vibrating screens', assets: ['SC-101A', 'SC-101B'], kind: 'vibrating_screen', spare: null },
  { name: 'Vibrator motors', assets: ['VM-101A', 'VM-101B'], kind: 'vibrator_motor', spare: 'SP-VM01' },
];
const short = (d: string | null) => { if (!d) return '—'; const [y, m, dd] = d.slice(0, 10).split('-'); return `${m}/${dd}/${y.slice(2)}`; };
/** 'P-101A; P-101B; SP-P01' -> ['P-101A/B', 'SP-P01'] */
const fitsShort = (v: string) => {
  const out: string[] = [];
  for (const t of v.split(';').map(x => x.trim()).filter(Boolean)) {
    const m = t.match(/^(.*\d)([A-Z])$/), prev = out[out.length - 1];
    if (m && prev && prev.startsWith(m[1]) && /^.*\d[A-Z](\/[A-Z])*$/.test(prev)) out[out.length - 1] = `${prev}/${m[2]}`;
    else out.push(t);
  }
  return out;
};
const fits = (p: { fits_assets: string }) => p.fits_assets.split(';').map(s => s.trim());
const stockTone = (p: { qty_on_hand: number; min_qty: number }) => (p.qty_on_hand <= 0 ? 'bad' : p.qty_on_hand < p.min_qty ? 'warn' : 'ok');

type Tone = 'ok' | 'warn' | 'bad';
const XKEY = 'gearcast.spares.extra.v1';
const loadExtra = (): SparePart[] => { try { return JSON.parse(localStorage.getItem(XKEY) || '[]'); } catch { return []; } };

/** Stock level vs target (max, else reorder / 2×min): green full = well stocked, amber = at/near minimum, red sliver = below minimum. */
function partLevel(p: SparePart): { pct: number; tone: Tone; label: string } {
  const target = p.max_qty || Math.max(p.reorder_point ?? 0, p.min_qty * 2, 1);
  const pct = Math.max(0.06, Math.min(1, p.qty_on_hand / target));
  const tone: Tone = p.qty_on_hand <= 0 || p.qty_on_hand < p.min_qty ? 'bad' : p.qty_on_hand <= (p.reorder_point ?? p.min_qty) ? 'warn' : 'ok';
  return { pct, tone, label: tone === 'ok' ? 'Well stocked' : tone === 'warn' ? 'At reorder level' : p.qty_on_hand <= 0 ? 'Out of stock' : 'Below minimum' };
}
function unitLevel(u: SpareSummary, overdue: boolean): { pct: number; tone: Tone; label: string } {
  if (u.readiness_status !== 'Ready') return { pct: 0.2, tone: 'bad', label: u.readiness_status };
  return overdue ? { pct: 0.6, tone: 'warn', label: 'Ready · check overdue' } : { pct: 1, tone: 'ok', label: 'Ready' };
}
function Ring({ pct, tone, size = 18 }: { pct: number; tone: Tone; size?: number }) {
  const r = size / 2 - 2.5, c = 2 * Math.PI * r;
  return (
    <svg className={`ring ${tone}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" />
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-fg" strokeDasharray={`${c * pct} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}

export function SpareReadiness() {
  const [extra, setExtra] = useState<SparePart[]>(loadExtra);
  const [info, setInfo] = useState<SparePart | null>(null);
  const [unitInfo, setUnitInfo] = useState<SpareSummary | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const parts = useMemo(() => [...OPS.spareInventory, ...extra], [extra]);
  const units = new Map(OPS.spareSummary.map(s => [s.asset_id, s]));

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return parts.filter(p => (!lowOnly || p.qty_on_hand < p.min_qty)
      && (!t || [p.part_id, p.part_name, p.fits_assets, p.category, p.part_number, p.storage_location].some(v => String(v ?? '').toLowerCase().includes(t))));
  }, [q, lowOnly, parts]);
  const below = parts.filter(p => p.qty_on_hand < p.min_qty).length;

  return (
    <div className="page sp-page">
      <header className="page-head row">
        <div>
          <h1>Spare Readiness</h1>
          <p>Stored standby units and the critical parts that fit each piece of equipment. Rings show how ready each one is — click for details.</p>
        </div>
        <button type="button" className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" size={14} />Add spare part</button>
      </header>

      <div className="sp-cards">
        {GROUPS.map(g => {
          const unit = g.spare ? units.get(g.spare) : undefined;
          const overdue = !!unit?.next_check_due && unit.next_check_due.slice(0, 10) < NOW_DATE;
          const list = parts.filter(p => fits(p).some(a => g.assets.includes(a)));
          const img = thumbUrl(g.kind);
          return (
            <div key={g.name} className="card sp-card">
              <div className="sp-hero">{img && <img src={img} alt={g.name} loading="lazy" />}</div>
              <div className="sp-name"><b>{g.name}</b>
                <span>{g.assets.map(a => <button key={a} type="button" className="link mono" onClick={() => openAsset(a)}>{a}</button>)}</span>
              </div>
              <div className={`sp-unit ${unit ? (overdue ? 'warn' : unit.readiness_status === 'Ready' ? 'ok' : 'bad') : 'none'}`}>
                {unit ? <>
                  <button type="button" className="ring-btn" onClick={() => setUnitInfo(unit)} aria-label={`${unit.asset_id} readiness details`}>
                    <Ring {...unitLevel(unit, overdue)} size={22} /><span className="mono">{unit.asset_id}</span>
                  </button>
                  <b>{overdue ? 'Check overdue' : unit.readiness_status}</b>
                  <span className="muted small">checked {short(unit.last_check_date)} · next {short(unit.next_check_due)}</span>
                </> : <span className="muted small">No stored standby unit (spare parts only)</span>}
              </div>
              <ul className="sp-parts">
                {list.map(p => (
                  <li key={p.part_id} onClick={() => setInfo(p)} title={`${partLevel(p).label} – click for details`}>
                    <Ring {...partLevel(p)} />
                    <span className="sp-pname">{p.part_name}</span>
                    <span className={`sp-qty ${stockTone(p)}`}>{p.qty_on_hand}<small>/{p.min_qty} {p.unit}</small></span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="card pm-table-card">
        <div className="pm-table-head sp-tools">
          <input className="sp-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search parts, part no., asset or location…" aria-label="Search spare parts" />
          <label className="sp-toggle"><input type="checkbox" checked={lowOnly} onChange={e => setLowOnly(e.target.checked)} /> Below minimum only <span className="badge warn">{below}</span></label>
          <span className="muted small">{rows.length} of {parts.length} parts</span>
        </div>
        <div className="table-wrap">
          <table className="sp-table">
            <colgroup><col style={{ width: 84 }} /><col /><col style={{ width: 150 }} /><col style={{ width: 100 }} /><col style={{ width: 84 }} /><col style={{ width: 52 }} /><col style={{ width: 68 }} /><col style={{ width: 72 }} /><col style={{ width: 108 }} /><col style={{ width: 92 }} /></colgroup>
            <thead><tr><th>Part</th><th>Name</th><th>Fits</th><th>Category</th><th>On hand</th><th>Min</th><th>Reorder</th><th>Lead</th><th>Location</th><th>Critical</th></tr></thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.part_id}>
                  <td className="mono">{p.part_id}</td>
                  <td>{p.part_name}{p.part_number && <div className="muted small">{p.part_number}</div>}</td>
                  <td><span className="sp-fits">{fitsShort(p.fits_assets).map(f => <span key={f} className="sp-fit">{f}</span>)}</span></td>
                  <td className="small">{p.category}</td>
                  <td><button type="button" className="ring-btn" onClick={() => setInfo(p)}><Ring {...partLevel(p)} /><span className={`sp-qty ${stockTone(p)}`}>{p.qty_on_hand} <small>{p.unit}</small></span></button></td>
                  <td className="mono">{p.min_qty}</td>
                  <td className="mono">{p.reorder_point ?? '—'}</td>
                  <td className="mono">{p.lead_time_days != null ? `${p.lead_time_days} d` : '—'}</td>
                  <td className="mono small">{p.storage_location ?? '—'}</td>
                  <td>{p.critical ? <span className="badge warn">Critical</span> : <span className="muted">—</span>}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={10} className="muted">No parts match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {info && <PartModal p={info} onClose={() => setInfo(null)} />}
      {unitInfo && <UnitModal u={unitInfo} onClose={() => setUnitInfo(null)} />}
      {adding && <AddPartModal next={nextId(parts)} onClose={() => setAdding(false)} onSave={p => {
        const n = [...extra, p]; setExtra(n); try { localStorage.setItem(XKEY, JSON.stringify(n)); } catch { /* storage unavailable */ } setAdding(false);
      }} />}
    </div>
  );
}

const nextId = (parts: SparePart[]) => `SPP-${String(Math.max(0, ...parts.map(p => Number(p.part_id.replace(/\D/g, '')) || 0)) + 1).padStart(3, '0')}`;
const php = (n: number | null | undefined) => (n == null ? '—' : `PHP ${Math.round(n).toLocaleString('en-US')}`);

function KV({ rows }: { rows: [string, React.ReactNode][] }) {
  return <dl className="sp-kv">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v ?? '—'}</dd></div>)}</dl>;
}

function PartModal({ p, onClose }: { p: SparePart; onClose: () => void }) {
  const lv = partLevel(p);
  return (
    <Modal title={p.part_name} onClose={onClose} width={480}>
      <div className="sp-mhead"><Ring {...lv} size={44} /><div><b className={`sp-qty ${lv.tone}`}>{lv.label}</b>
        <div className="muted small">{p.qty_on_hand} {p.unit} on hand · min {p.min_qty}{p.max_qty ? ` · max ${p.max_qty}` : ''}</div></div></div>
      <KV rows={[
        ['Part', <span className="mono">{p.part_id}</span>], ['Part number', p.part_number], ['Category', p.category],
        ['Fits', <span className="sp-fits">{fitsShort(p.fits_assets).map(f => <span key={f} className="sp-fit">{f}</span>)}</span>],
        ['Reorder point', p.reorder_point], ['Lead time', p.lead_time_days != null ? `${p.lead_time_days} days` : null],
        ['Unit cost', php(p.unit_cost_php)], ['Stock value', php((p.unit_cost_php ?? 0) * p.qty_on_hand)],
        ['Location', p.storage_location], ['Critical', p.critical ? 'Yes' : 'No'],
      ]} />
      {lv.tone !== 'ok' && <div className="alert-box warn small">Order {Math.max((p.max_qty || p.reorder_point || p.min_qty) - p.qty_on_hand, 1)} {p.unit} — lead time {p.lead_time_days ?? '?'} days.</div>}
    </Modal>
  );
}

function UnitModal({ u, onClose }: { u: SpareSummary; onClose: () => void }) {
  const overdue = !!u.next_check_due && u.next_check_due.slice(0, 10) < NOW_DATE;
  const lv = unitLevel(u, overdue);
  return (
    <Modal title={`Stored spare ${u.asset_id}`} onClose={onClose} width={460}>
      <div className="sp-mhead"><Ring {...lv} size={44} /><div><b className={`sp-qty ${lv.tone}`}>{lv.label}</b><div className="muted small">{u.spare_type}</div></div></div>
      <KV rows={[['Location', u.location], ['Last check', `${short(u.last_check_date)}`], ['Next check due', short(u.next_check_due)], ['Remarks', u.remarks]]} />
      <div className="q-actions"><button type="button" className="btn sm" onClick={() => { onClose(); openAsset(u.asset_id); }}>Open {u.asset_id}</button></div>
    </Modal>
  );
}

const ALL_ASSETS = ['P-101A', 'P-101B', 'M-101A', 'M-101B', 'P-201A', 'P-201B', 'SC-101A', 'SC-101B', 'VM-101A', 'VM-101B', 'SP-P01', 'SP-P02', 'SP-M01', 'SP-VM01'];

function AddPartModal({ next, onClose, onSave }: { next: string; onClose: () => void; onSave: (p: SparePart) => void }) {
  const [f, setF] = useState({ name: '', number: '', category: 'Pump', unit: 'pc', qty: '1', min: '1', max: '', lead: '', cost: '', location: '', critical: false, fits: [] as string[] });
  const set = (k: keyof typeof f, v: unknown) => setF(x => ({ ...x, [k]: v }));
  const ok = f.name.trim() && f.fits.length && f.qty !== '' && f.min !== '';
  const save = () => onSave({
    part_id: next, part_name: f.name.trim(), part_number: f.number || null, category: f.category, unit: f.unit, fits_assets: f.fits.join('; '),
    qty_on_hand: Number(f.qty), min_qty: Number(f.min), max_qty: f.max ? Number(f.max) : null, reorder_point: null,
    lead_time_days: f.lead ? Number(f.lead) : null, unit_cost_php: f.cost ? Number(f.cost) : null, critical: f.critical,
    storage_location: f.location || null, below_min: Number(f.qty) < Number(f.min),
  });
  return (
    <Modal title="Add spare part" onClose={onClose} width={560}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={!ok} onClick={save}>Add part</button></>}>
      <div className="sp-form">
        <label className="wide">Part name<input data-autofocus value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Mechanical seal kit" /></label>
        <label>Part number<input value={f.number} onChange={e => set('number', e.target.value)} /></label>
        <label>Category<select value={f.category} onChange={e => set('category', e.target.value)}>{['Pump', 'Motor', 'Screen', 'Electrical', 'Valve', 'Consumable', 'Other'].map(c => <option key={c}>{c}</option>)}</select></label>
        <label>On hand<input type="number" min="0" value={f.qty} onChange={e => set('qty', e.target.value)} /></label>
        <label>Minimum<input type="number" min="0" value={f.min} onChange={e => set('min', e.target.value)} /></label>
        <label>Maximum<input type="number" min="0" value={f.max} onChange={e => set('max', e.target.value)} /></label>
        <label>Unit<select value={f.unit} onChange={e => set('unit', e.target.value)}>{['pc', 'set', 'kg', 'L', 'm'].map(c => <option key={c}>{c}</option>)}</select></label>
        <label>Lead time (days)<input type="number" min="0" value={f.lead} onChange={e => set('lead', e.target.value)} /></label>
        <label>Unit cost (PHP)<input type="number" min="0" value={f.cost} onChange={e => set('cost', e.target.value)} /></label>
        <label>Location<input value={f.location} onChange={e => set('location', e.target.value)} placeholder="Store A-01" /></label>
        <label className="chk"><input type="checkbox" checked={f.critical} onChange={e => set('critical', e.target.checked)} /> Critical part</label>
        <div className="wide"><span className="sp-flabel">Fits assets</span>
          <div className="sp-fitpick">{ALL_ASSETS.map(a => (
            <button key={a} type="button" className={`sp-fit${f.fits.includes(a) ? ' on' : ''}`} onClick={() => set('fits', f.fits.includes(a) ? f.fits.filter(x => x !== a) : [...f.fits, a])}>{a}</button>
          ))}</div>
        </div>
      </div>
      <p className="muted small">Saved as {next} in this browser.</p>
    </Modal>
  );
}

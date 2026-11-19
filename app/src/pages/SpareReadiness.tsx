import { useMemo, useState } from 'react';
import { NOW_DATE, OPS } from '../data';
import { thumbUrl } from '../overview/thumbs';
import { openAsset } from '../shell/TopBar';
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

export function SpareReadiness() {
  const [q, setQ] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const parts = OPS.spareInventory;
  const units = new Map(OPS.spareSummary.map(s => [s.asset_id, s]));

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return parts.filter(p => (!lowOnly || p.qty_on_hand < p.min_qty)
      && (!t || [p.part_id, p.part_name, p.fits_assets, p.category, p.part_number, p.storage_location].some(v => String(v ?? '').toLowerCase().includes(t))));
  }, [q, lowOnly, parts]);
  const below = parts.filter(p => p.qty_on_hand < p.min_qty).length;

  return (
    <div className="page sp-page">
      <header className="page-head">
        <h1>Spare Readiness</h1>
        <p>Stored standby units and the critical parts that fit each piece of equipment.</p>
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
                  <span className="mono">{unit.asset_id}</span>
                  <b>{overdue ? 'Check overdue' : unit.readiness_status}</b>
                  <span className="muted small">checked {short(unit.last_check_date)} · next {short(unit.next_check_due)}</span>
                </> : <span className="muted small">No stored standby unit (spare parts only)</span>}
              </div>
              <ul className="sp-parts">
                {list.map(p => (
                  <li key={p.part_id}>
                    <span className="sp-pname" title={p.part_name}>{p.part_name}</span>
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
                  <td><span className={`sp-qty ${stockTone(p)}`}>{p.qty_on_hand} <small>{p.unit}</small></span></td>
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
    </div>
  );
}

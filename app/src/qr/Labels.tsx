/** Printable QR asset labels (Plant Supervisor / Engineer). QR codes are generated in the browser (qrcode).
 *  Default payload is a GearCast link (`https://<site>/asset/<ID>`): any phone camera opens it and lands in the asset
 *  quick view after sign-in. The workbook's app scheme (`gearcast://asset/<ID>`) is available for in-app scanning only. */
import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { PLANT, plantName } from '../data';
import { areaName } from '../domain/layout';
import { useCan } from '../store/authStore';
import { Icon } from '../shell/icons';
import { labelPayload, qrTags, useScan, type Tag } from './scanStore';
import '../styles/pages.css';

type Fmt = 'link' | 'app';
type Size = 's' | 'm' | 'l';
const SIZES: [Size, string][] = [['s', '50 mm'], ['m', '70 mm'], ['l', '100 mm']];

function fallbackTags(): Tag[] {
  return PLANT.equipment.map(a => ({ tag_id: `QR-${a.asset_id}`, asset_id: a.asset_id, qr_payload: `gearcast://asset/${a.asset_id}`, location_node: a.location_node,
    label_placement: null, label_material: null, environment: null, installed_date: null, last_verified: null }));
}

/** QR image (PNG data URL) for a payload. Error correction Q: labels get dirty in a wet area. */
function useQr(text: string) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    QRCode.toDataURL(text, { errorCorrectionLevel: 'Q', margin: 2, width: 480, color: { dark: '#000000', light: '#ffffff' } })
      .then(u => on && setSrc(u)).catch(() => on && setSrc(null));
    return () => { on = false; };
  }, [text]);
  return src;
}

function Label({ tag, payload }: { tag: Tag; payload: string }) {
  const src = useQr(payload);
  const a = PLANT.equipment.find(x => x.asset_id === tag.asset_id);
  const loc = tag.location_node === 'STORE' || !tag.location_node ? 'Spares store' : `${tag.location_node} · ${areaName(tag.location_node)}`;
  return (
    <figure className="lb-label">
      {src ? <img src={src} alt={`QR code ${payload}`} data-payload={payload} /> : <span className="lb-qr-wait" />}
      <figcaption>
        <span className="lb-brand">Gear<b>Cast</b> · scan for history</span>
        <span className="lb-id mono">{tag.asset_id === 'STORE' ? 'STORE' : tag.asset_id}</span>
        <span className="lb-desc">{a?.description ?? (tag.asset_id === 'STORE' ? 'Spares store' : '')}</span>
        <span className="lb-meta mono">{tag.tag_id} · {loc}</span>
      </figcaption>
    </figure>
  );
}

export function Labels() {
  const allowed = useCan('qr.labels');
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [fmt, setFmt] = useState<Fmt>('link');
  const [size, setSize] = useState<Size>('m');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => {
    qrTags().then(t => { setTags(t); setSel(new Set(t.map(x => x.tag_id))); })
      .catch(() => { const t = fallbackTags(); setTags(t); setSel(new Set(t.map(x => x.tag_id))); setNote('Offline: labels built from the bundled asset register.'); });
  }, []);
  const origin = window.location.origin;
  const payloadOf = (t: Tag) => (t.qr_payload.startsWith('gearcast://location/')
    ? (fmt === 'link' ? `${origin}/location/${t.qr_payload.split('/').pop()}` : t.qr_payload)
    : labelPayload(t.asset_id, fmt === 'link' ? origin : null));
  const ql = q.trim().toLowerCase();
  const shown = useMemo(() => (tags ?? []).filter(t => !ql || [t.tag_id, t.asset_id, t.location_node, PLANT.equipment.find(a => a.asset_id === t.asset_id)?.description]
    .some(v => String(v ?? '').toLowerCase().includes(ql))), [tags, ql]);
  const printing = (tags ?? []).filter(t => sel.has(t.tag_id));
  const toggle = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  if (!allowed) return (
    <div className="page"><header className="page-head"><h1>QR labels</h1><p>Printing asset labels is for Plant Supervisors and Engineers. Use Scan QR to open an asset.</p></header></div>
  );

  return (
    <div className="page lb-page">
      <header className="page-head no-print">
        <h1>QR labels</h1>
        <p>Print a QR tag for each asset. Scanning it (GearCast Scan QR, or any phone camera for link labels) opens the asset’s history.</p>
      </header>
      <div className="lb-tools card no-print">
        <div className="lb-opts">
          <span className="muted small">Encode</span>
          <div className="range" role="group" aria-label="Payload">
            <button type="button" className={fmt === 'link' ? 'on' : ''} onClick={() => setFmt('link')}>Link (any camera)</button>
            <button type="button" className={fmt === 'app' ? 'on' : ''} onClick={() => setFmt('app')}>gearcast:// (in-app)</button>
          </div>
          <span className="muted small">Size</span>
          <div className="range" role="group" aria-label="Label size">
            {SIZES.map(([k, l]) => <button key={k} type="button" className={size === k ? 'on' : ''} onClick={() => setSize(k)}>{l}</button>)}
          </div>
          <button type="button" className="btn primary" disabled={!printing.length} onClick={() => window.print()}><Icon name="print" size={14} />Print {printing.length} label{printing.length === 1 ? '' : 's'}</button>
        </div>
        <p className="muted small">
          {fmt === 'link' ? <>Labels encode <span className="mono">{labelPayload('P-101A', origin)}</span>. </> : <>Labels encode <span className="mono">gearcast://asset/P-101A</span> (QR_Tags payload); phone camera apps cannot open it, use Scan QR in GearCast. </>}
          Material per QR_Tags: SS316 laser-etched in the wet area, anodised aluminium in the store. For the demo, print on paper or sticker stock.
        </p>
        {note && <p className="warn small">{note}</p>}
        <input className="sp-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by asset, tag or area…" aria-label="Filter labels" />
        <div className="lb-pick">
          <button type="button" className="btn sm ghost" onClick={() => setSel(new Set([...sel, ...shown.map(t => t.tag_id)]))}>Select shown</button>
          <button type="button" className="btn sm ghost" onClick={() => setSel(new Set([...sel].filter(id => !shown.some(t => t.tag_id === id))))}>Clear shown</button>
          {shown.map(t => (
            <label key={t.tag_id} className={`lb-chip${sel.has(t.tag_id) ? ' on' : ''}`} title={t.basis ?? t.label_placement ?? ''}>
              <input type="checkbox" checked={sel.has(t.tag_id)} onChange={() => toggle(t.tag_id)} />
              <span className="mono">{t.asset_id}</span>
            </label>
          ))}
        </div>
      </div>

      <div className={`lb-sheet size-${size}`}>
        <div className="print-only lb-print-head">{plantName} · GearCast asset QR labels</div>
        {printing.map(t => (
          <div key={t.tag_id} className="lb-cell">
            <Label tag={t} payload={payloadOf(t)} />
            <div className="lb-under no-print">
              <span className="muted small">{t.label_placement ?? 'Placement to confirm'}</span>
              {t.asset_id !== 'STORE' && <button type="button" className="link small" onClick={() => useScan.getState().show(t.asset_id)}>Preview</button>}
            </div>
          </div>
        ))}
        {tags && !printing.length && <p className="muted no-print">No labels selected.</p>}
        {!tags && <p className="muted">Loading tags…</p>}
      </div>
    </div>
  );
}

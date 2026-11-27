/** "Scan QR" sheet: live camera (rear camera on phones/tablets), photo-of-label fallback and manual tag / asset entry. */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Icon } from '../shell/icons';
import { PLANT } from '../data';
import { decodeFile, decodeFrame, engine, type Engine } from './decode';
import { parseScan, SCAN_PURPOSES, useScan, type Purpose } from './scanStore';

type Cam = 'starting' | 'on' | 'denied' | 'unavailable' | 'off';

export function Scanner() {
  const { busy, error, purpose, setPurpose, submit, closeScanner } = useScan();
  const video = useRef<HTMLVideoElement>(null);
  const [cam, setCam] = useState<Cam>('starting');
  const [eng, setEng] = useState<Engine | null>(null);
  const [manual, setManual] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const done = useRef(false);

  const go = async (code: string) => {
    if (done.current) return;
    done.current = true;
    const err = await submit(code);
    if (err) { done.current = false; setHint(err); }
  };

  useEffect(() => {
    let stream: MediaStream | null = null, timer = 0, alive = true;
    engine().then(e => alive && setEng(e));
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setCam('unavailable'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      } catch (e) { if (alive) setCam((e as DOMException)?.name === 'NotAllowedError' ? 'denied' : 'unavailable'); return; }
      if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
      const v = video.current!;
      v.srcObject = stream;
      await v.play().catch(() => {});
      setCam('on');
      let last = '';
      const tick = async () => {
        if (!alive || done.current) return;
        if (v.readyState >= 2) {
          const txt = await decodeFrame(v).catch(() => null);
          if (txt && alive) {
            if (parseScan(txt)) { go(txt); return; }
            if (txt !== last) { last = txt; setHint(`Not a GearCast label: “${txt.slice(0, 60)}”`); }
          }
        }
        timer = window.setTimeout(tick, 180);
      };
      tick();
    })();
    return () => { alive = false; window.clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeScanner(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeScanner]);

  const fromPhoto = async (f: File | undefined) => {
    if (!f) return;
    setHint('Reading photo…');
    const txt = await decodeFile(f).catch(() => null);
    if (!txt) { setHint('No QR code found in the photo. Hold the label flat and fill the frame.'); return; }
    if (!parseScan(txt)) { setHint(`Not a GearCast label: “${txt.slice(0, 60)}”`); return; }
    setHint(null);
    go(txt);
  };

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    const v = manual.trim();
    if (!v) return;
    if (!parseScan(v)) { setHint('Enter an asset id (P-101A), a tag id (QR-P-101A) or a label link'); return; }
    done.current = false;
    go(v);
  };

  return (
    <div className="qr-sheet-backdrop" role="dialog" aria-modal="true" aria-label="Scan asset QR code">
      <div className="qr-sheet">
        <header>
          <h2><Icon name="qr" size={18} />Scan asset QR</h2>
          <button type="button" className="icon-btn" onClick={closeScanner} aria-label="Close"><Icon name="close" /></button>
        </header>

        <div className="qr-cam">
          <video ref={video} playsInline muted className={cam === 'on' ? 'on' : ''} />
          {cam === 'on' && <div className="qr-reticle" aria-hidden="true"><i /><i /><i /><i /></div>}
          {cam !== 'on' && (
            <div className="qr-cam-msg">
              <Icon name="camera" size={28} stroke={1.3} />
              {cam === 'starting' && <p>Starting camera…</p>}
              {cam === 'denied' && <p>Camera permission was refused. Allow the camera for this site, or take a photo / type the tag below.</p>}
              {cam === 'unavailable' && <p>{window.isSecureContext ? 'No camera found.' : 'The live camera needs HTTPS.'} Take a photo of the label or type the tag below.</p>}
            </div>
          )}
          {(busy || hint) && <div className={`qr-cam-hint${busy ? ' busy' : ''}`}>{busy ? 'Opening asset…' : hint}</div>}
        </div>

        <div className="qr-purpose" role="group" aria-label="Why are you scanning?">
          <span className="muted small">Purpose</span>
          {SCAN_PURPOSES.map(p => (
            <button key={p} type="button" className={purpose === p ? 'on' : ''} aria-pressed={purpose === p} onClick={() => setPurpose(p as Purpose)}>{p}</button>
          ))}
        </div>

        <form className="qr-manual" onSubmit={submitManual}>
          <input value={manual} onChange={e => { setManual(e.target.value); setHint(null); }} list="qr-assets" inputMode="text" autoCapitalize="characters"
            autoComplete="off" spellCheck={false} placeholder="Tag or asset id, e.g. P-101A" aria-label="Tag or asset id" />
          <datalist id="qr-assets">
            {PLANT.equipment.map(a => <option key={a.asset_id} value={a.asset_id}>{a.description}</option>)}
          </datalist>
          <button type="submit" className="btn primary" disabled={busy || !manual.trim()}>Open</button>
          <label className="btn ghost qr-photo" title="Take or choose a photo of the label">
            <Icon name="camera" size={14} />Photo
            <input type="file" accept="image/*" capture="environment" onChange={e => { fromPhoto(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </form>
        {error && !hint && <p className="qr-err">{error}</p>}
        <p className="muted small qr-foot">Reads GearCast labels (<span className="mono">gearcast://asset/…</span> or a GearCast link). Decoder: {eng === 'native' ? 'built-in (BarcodeDetector)' : eng === 'jsqr' ? 'jsQR' : '…'}.</p>
      </div>
    </div>
  );
}

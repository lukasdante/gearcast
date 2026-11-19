import { useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';
import { Caster } from './Caster';
import { THUMBS } from '../overview/thumbs';

/** Start-up screen: holds the app until the 3D models (GLB preloads) and asset snapshots are in memory. */
export function Splash() {
  const { active, loaded, total, progress } = useProgress();
  const [thumbs, setThumbs] = useState(0);
  const [minDone, setMinDone] = useState(false);
  const [gone, setGone] = useState(false);
  const nThumbs = THUMBS.size;

  useEffect(() => {
    const t = setTimeout(() => setMinDone(true), 700);
    let n = 0;
    THUMBS.forEach(k => { const img = new Image(); img.onload = img.onerror = () => setThumbs(++n); img.src = `/models/thumbs/${k}.png`; });
    return () => clearTimeout(t);
  }, []);

  const modelsDone = total > 0 && !active && progress >= 100;
  const ready = modelsDone && thumbs >= nThumbs && minDone;
  const pct = Math.round(((total ? loaded / total : 0) * 0.85 + (nThumbs ? thumbs / nThumbs : 1) * 0.15) * 100);
  useEffect(() => { if (ready) { const t = setTimeout(() => setGone(true), 450); return () => clearTimeout(t); } }, [ready]);
  // Safety valve: never trap the user behind the splash if a model fails to report.
  useEffect(() => { const t = setTimeout(() => setGone(true), 20000); return () => clearTimeout(t); }, []);
  if (gone) return null;

  return (
    <div className={`splash${ready ? ' out' : ''}`} role="status" aria-live="polite">
      <div className="splash-box">
        <Caster size={72} state="thinking" />
        <div className="splash-brand">Gear<b>Cast</b></div>
        <div className="splash-bar"><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
        <div className="splash-txt">{ready ? 'Ready' : `Loading plant models… ${Math.min(loaded, total)}/${total || '…'}`}</div>
      </div>
    </div>
  );
}

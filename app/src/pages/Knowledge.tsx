import { useEffect, useRef, useState } from 'react';
import { PLANT } from '../data';
import { del, getJSON, upload } from '../api/client';
import { Icon } from '../shell/icons';
import '../styles/pages.css';

interface Doc { doc_id: string; filename: string; title: string; asset_id?: string | null; equipment_model?: string | null; uploaded_at: string; chunks: number; bytes: number }
interface Docs { builtin: { source_type: string; title: string; chunks: number }[]; uploads: Doc[] }
interface Hit { id: string; source_type: string; title: string; page?: number; text: string; score: number }

export function Knowledge() {
  const [docs, setDocs] = useState<Docs | null>(null);
  const [asset, setAsset] = useState('');
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => getJSON<Docs>('/api/knowledge/docs').then(setDocs).catch(() => setErr('Backend offline – start it on :8000'));
  useEffect(() => { refresh(); }, []);

  const onUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('file', f);
    if (asset) fd.append('asset_id', asset);
    if (model) fd.append('equipment_model', model);
    setBusy(true); setErr(null);
    try { await upload('/api/knowledge/upload', fd); if (fileRef.current) fileRef.current.value = ''; refresh(); } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Upload failed'); } finally { setBusy(false); }
  };
  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    const r = await getJSON<{ results: Hit[] }>(`/api/knowledge/search?q=${encodeURIComponent(q)}&k=5`);
    setHits(r.results);
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Knowledge base</h1>
        <p>Procedures, symptoms, failure lessons and manuals that Caster searches (hybrid BM25 + local embeddings). Upload a manual when you register new equipment.</p>
      </header>
      {err && <div className="alert-box bad">{err}</div>}
      <div className="kb-layout">
        <div className="col">
          <form className="card kb-upload" onSubmit={onUpload}>
            <h4><Icon name="upload" size={14} /> Upload a manual</h4>
            <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" aria-label="Manual file" />
            <div className="form-grid">
              <label>Asset tag (optional)<select value={asset} onChange={e => setAsset(e.target.value)}><option value="">—</option>{PLANT.equipment.map(a => <option key={a.asset_id}>{a.asset_id}</option>)}</select></label>
              <label>Equipment model (optional)<input value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. Grundfos SL1.50" /></label>
            </div>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Indexing…' : 'Upload & index'}</button>
            <p className="small muted">PDF, DOCX, TXT or MD. Text is chunked by page and embedded locally; nothing leaves the server except the snippets Caster cites.</p>
          </form>
          <div className="card">
            <h4>Indexed sources</h4>
            <table className="tbl compact">
              <tbody>
                {docs?.builtin.map(b => <tr key={b.source_type}><td>{b.title}</td><td className="num mono">{b.chunks} chunks</td><td /></tr>)}
                {docs?.uploads.map(d => (
                  <tr key={d.doc_id}>
                    <td><Icon name="file" size={12} /> {d.title} <span className="muted small">{[d.asset_id, d.equipment_model].filter(Boolean).join(' · ')}</span></td>
                    <td className="num mono">{d.chunks} chunks</td>
                    <td className="num"><button type="button" className="icon-btn" aria-label={`Delete ${d.title}`} onClick={() => del(`/api/knowledge/docs/${d.doc_id}`).then(refresh)}><Icon name="trash" size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h4>Test retrieval</h4>
          <form className="kb-search" onSubmit={search}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. bearing temperature limit" />
            <button type="submit" className="btn">Search</button>
          </form>
          {hits?.map(h => (
            <div key={h.id} className="hit">
              <div className="hit-head"><span className="badge">{h.source_type}</span><b>{h.title}</b><span className="mono muted small">{h.score.toFixed(4)}</span></div>
              <p className="small muted">{h.text.slice(0, 280)}…</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

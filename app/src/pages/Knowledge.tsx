import { useEffect, useRef, useState } from 'react';
import { OPS, PLANT, type Procedure } from '../data';
import { del, getJSON, upload } from '../api/client';
import { Modal, dialog } from '../shell/Modal';
import { ProcedureModal } from '../overview/Inspector';
import { Icon } from '../shell/icons';
import { useCan } from '../store/authStore';
import '../styles/pages.css';

interface Doc { doc_id: string; filename: string; title: string; asset_id?: string | null; equipment_model?: string | null; uploaded_at: string; chunks: number; bytes: number }
interface Docs { builtin: { source_type: string; title: string; chunks: number }[]; uploads: Doc[] }
interface Hit { id: string; source_type: string; source_id?: string; title: string; page?: number | null; text: string; score: number }

/** Built-in PDFs (served to signed-in users only, see worker index.ts). */
const BUILTIN_FILE: Record<string, string> = { manual: '/docs/WWTP_Maintenance_Manual.pdf', ir_format: '/docs/Incident_Report_Format.pdf' };
const uploadUrl = (docId: string) => `/api/knowledge/docs/${encodeURIComponent(docId)}/file`;
/** Where a retrieval hit's source file opens (PDFs jump to the cited page); null for structured records. */
function hitUrl(h: Hit, uploads: Doc[]): string | null {
  const page = h.page ? `#page=${h.page}` : '';
  if (BUILTIN_FILE[h.source_type]) return BUILTIN_FILE[h.source_type] + page;
  if (h.source_type === 'upload' && h.source_id) {
    const d = uploads.find(u => u.doc_id === h.source_id);
    return uploadUrl(h.source_id) + (d && /\.pdf$/i.test(d.filename) ? page : '');
  }
  return null;
}

/** A structured source (procedure, symptom, failure record, or a DOCX's text) opened in full. */
interface SourceRec { source_type: string; source_id: string; label: string; title: string; chunks: { id: string; source_type: string; title: string; page: number | null; text: string }[] }
type Opened = { kind: 'procedure'; p: Procedure } | { kind: 'record'; type: string; id: string };
const procOf = (h: { source_type: string; source_id?: string }) =>
  (h.source_type === 'procedure' || h.source_type === 'procedure_steps') && h.source_id ? OPS.procedures.find(p => p.procedure_id === h.source_id) ?? null : null;
const figuresFor = (id: string) => OPS.procedureFigures.filter(f => (f as unknown as { procedure_id?: string }).procedure_id === id);

function SourceModal({ type, id, onClose }: { type: string; id: string; onClose: () => void }) {
  const [rec, setRec] = useState<SourceRec | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { getJSON<SourceRec>(`/api/knowledge/source/${encodeURIComponent(type)}/${encodeURIComponent(id)}`).then(setRec).catch(e => setErr(e instanceof Error ? e.message : 'Could not open the source')); }, [type, id]);
  const figs = figuresFor(id);
  return (
    <Modal title={rec ? rec.title : `${type} ${id}`} onClose={onClose} width={640} footer={<>
      {type === 'upload' && <a className="btn" href={uploadUrl(id)} target="_blank" rel="noopener"><Icon name="file" size={12} />Download original</a>}
      <button type="button" className="btn primary" onClick={onClose}>Close</button>
    </>}>
      {err && <div className="alert-box bad">{err}</div>}
      {!rec && !err && <p className="muted small">Loading…</p>}
      {rec && <>
        <p className="muted small"><span className="badge">{rec.source_type}</span> {rec.label} · {rec.source_id}</p>
        <div className="kb-source">{rec.chunks.map(c => <div key={c.id} className="kb-source-chunk">
          {rec.chunks.length > 1 && <b className="small">{c.title}{c.page ? ` · p.${c.page}` : ''}</b>}
          <p className="small">{c.text}</p></div>)}</div>
        {!!figs.length && <div className="proc-figs">{figs.map(f => <figure key={f.figure_id}><a href={`/figures/${f.file_name}`} target="_blank" rel="noopener"><img src={`/figures/${f.file_name}`} alt={f.title} loading="lazy" /></a><figcaption>{f.figure_id} · {f.title}</figcaption></figure>)}</div>}
      </>}
    </Modal>
  );
}

export function Knowledge() {
  const [docs, setDocs] = useState<Docs | null>(null);
  const [asset, setAsset] = useState('');
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [drag, setDrag] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const manage = useCan('kb.manage');
  const [opened, setOpened] = useState<Opened | null>(null);
  /** Open a retrieval hit's source: the PDF (at the cited page) or uploaded file, else the full record in the app. */
  const openHit = (h: Hit) => {
    const p = procOf(h);
    if (p) setOpened({ kind: 'procedure', p });
    else if (h.source_id) setOpened({ kind: 'record', type: h.source_type, id: h.source_id });
  };

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
    try { await upload('/api/knowledge/upload', fd); if (fileRef.current) fileRef.current.value = ''; setFileName(''); refresh(); } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Upload failed'); } finally { setBusy(false); }
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
        <p>Procedures, symptoms, failure lessons and manuals that Caster searches (hybrid BM25 + local embeddings). {manage ? 'Upload a manual when you register new equipment.' : 'Search the knowledge base and open the source files. Indexing new manuals is done by a Plant Supervisor or Engineer.'}</p>
      </header>
      {err && <div className="alert-box bad">{err}</div>}
      <div className="kb-layout">
        <div className="col">
          {manage && <form className="card kb-upload" onSubmit={onUpload}>
            <h4><Icon name="upload" size={14} /> Upload a manual</h4>
            <label className={`kb-drop${fileName ? ' has' : ''}${drag ? ' drag' : ''}`}
              onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); if (fileRef.current && e.dataTransfer.files.length) { fileRef.current.files = e.dataTransfer.files; setFileName(e.dataTransfer.files[0].name); } }}>
              <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" aria-label="Manual file" className="kb-file" onChange={e => setFileName(e.target.files?.[0]?.name ?? '')} />
              <Icon name="file" size={20} />
              {fileName ? <><b className="kb-fname">{fileName}</b><span className="muted small">Click to choose a different file</span></>
                : <><b>Drop a manual here or <u>browse</u></b><span className="muted small">PDF, DOCX, TXT or MD</span></>}
            </label>
            <div className="form-grid">
              <label>Asset tag (optional)
                <input list="kb-assets" value={asset} onChange={e => setAsset(e.target.value.toUpperCase())} placeholder="Pick or type a new tag, e.g. P-301A" />
                <datalist id="kb-assets">{[...new Set([...PLANT.equipment.map(a => a.asset_id), ...(docs?.uploads ?? []).map(d => d.asset_id).filter((x): x is string => !!x)])].map(a => <option key={a} value={a} />)}</datalist>
              </label>
              <label>Equipment model (optional)<input value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. Grundfos SL1.50" /></label>
            </div>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Indexing…' : 'Upload & index'}</button>
            <p className="small muted">PDF, DOCX, TXT or MD. Text is chunked by page and embedded locally; nothing leaves the server except the snippets Caster cites.</p>
          </form>}
          <div className="card">
            <h4>Indexed sources</h4>
            <table className="tbl compact">
              <tbody>
                {docs?.builtin.map(b => <tr key={b.source_type}><td>{BUILTIN_FILE[b.source_type] ? <a href={BUILTIN_FILE[b.source_type]} target="_blank" rel="noopener">{b.title}</a> : b.title}</td><td className="num mono">{b.chunks} chunks</td><td /></tr>)}
                {docs?.uploads.map(d => (
                  <tr key={d.doc_id}>
                    <td><Icon name="file" size={12} /> <a href={uploadUrl(d.doc_id)} target="_blank" rel="noopener">{d.title}</a>{!/\.pdf$/i.test(d.filename) && <> <button type="button" className="link small" onClick={() => setOpened({ kind: 'record', type: 'upload', id: d.doc_id })}>read</button></>} <span className="muted small">{[d.asset_id, d.equipment_model].filter(Boolean).join(' · ')}</span></td>
                    <td className="num mono">{d.chunks} chunks</td>
                    <td className="num">{manage && <button type="button" className="icon-btn" aria-label={`Delete ${d.title}`} onClick={async () => { if (await dialog.confirm({ title: 'Delete document', danger: true, action: 'Delete document', typeToConfirm: d.title, body: <p>This removes <b>{d.title}</b> from the knowledge base and Caster's search index.</p> })) del(`/api/knowledge/docs/${d.doc_id}`).then(refresh); }}><Icon name="trash" size={14} /></button>}</td>
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
          {hits?.length === 0 && <p className="muted small">No matches.</p>}
          {hits?.map(h => {
            const href = hitUrl(h, docs?.uploads ?? []), open = !!expanded[h.id];
            return (
              <div key={h.id} className="hit">
                <div className="hit-head"><span className="badge">{h.source_type}</span><b>{h.title}</b><span className="mono muted small">{h.score.toFixed(4)}</span></div>
                <p className="small muted kb-hit-text">{open || h.text.length <= 280 ? h.text : `${h.text.slice(0, 280)}…`}</p>
                <div className="kb-hit-actions">
                  {href ? <a className="btn sm" href={href} target="_blank" rel="noopener"><Icon name="file" size={12} />Open {h.page ? `p.${h.page}` : 'file'}</a>
                    : h.source_id && <button type="button" className="btn sm" onClick={() => openHit(h)}><Icon name="file" size={12} />Open {procOf(h) ? 'procedure' : 'record'}</button>}
                  {href && h.source_type === 'upload' && h.source_id && !/\.pdf$/i.test(docs?.uploads.find(u => u.doc_id === h.source_id)?.filename ?? '') &&
                    <button type="button" className="btn ghost sm" onClick={() => openHit(h)}>Read text</button>}
                  {h.text.length > 280 && <button type="button" className="btn ghost sm" onClick={() => setExpanded(x => ({ ...x, [h.id]: !open }))}>{open ? 'Show less' : 'Show full text'}</button>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {opened?.kind === 'procedure' && <ProcedureModal p={opened.p} onClose={() => setOpened(null)} />}
      {opened?.kind === 'record' && <SourceModal type={opened.type} id={opened.id} onClose={() => setOpened(null)} />}
    </div>
  );
}

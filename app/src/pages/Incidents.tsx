import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PLANT } from '../data';
import { downloadBlob, getJSON, postJSON, simPayload } from '../api/client';
import { draftDocxBlob, draftPdfBlob, fetchTrends, photoMeta, preparePhoto, reportDocxBlob, reportPdfBlob, saveReportTrend, storeReportPdf, uploadReportPhotos,
  type ReportPhoto, type TrendIndicator, type TrendOpts } from '../api/incidentDocs';
import { chartSvg, type TrendSpec } from '../../../worker/src/doc/chart';
import { CostBreakdown, type CostEst } from '../overview/ShutdownCost';
import { Icon } from '../shell/icons';
import { Caster } from '../shell/Caster';
import { openAsset } from '../shell/TopBar';
import { useStatusStore } from '../store/statusStore';
import { useIntent } from '../store/intentStore';
import { useAuth } from '../store/authStore';
import { fmtDate, nowStamp } from '../domain/assetInfo';
import '../styles/pages.css';

interface Field { field_no: number; section: string; field: string; filled_by: string; allowed_values: string; value: string; source: 'data' | 'ai' | 'user' }
interface Draft {
  report_id: string; asset_id: string; failure_at: string; shut_down: boolean; fields: Field[]; summary?: string; warnings: string[];
  tables?: { trends?: TrendSpec[] }; trend?: TrendOpts; trend_indicators?: TrendIndicator[];
  linked: { cost: CostEst;
    repair_or_replace: { recommendation: string; confidence: number }; standby: string; spare?: string; failure_event?: { event_id: string } | null };
  llm_used: boolean; [k: string]: unknown;
}
interface Row { report_id: string; asset_id: string; date: string; severity?: string; failure_mode?: string | null; status?: string; summary?: string | null; source: 'history' | 'submitted'; shut_down?: boolean; procedure_used?: string | null; repair_cost_php?: number | null; production_loss_php?: number | null }
const shortDate = (d: string) => { if (!d) return '—'; const [y, m, dd] = d.slice(0, 10).split('-'); return `${m}/${dd}/${y.slice(2)}`; };

const ASSETS = PLANT.equipment.filter(a => !a.asset_id.startsWith('SP-')).map(a => a.asset_id).concat(PLANT.equipment.filter(a => a.asset_id.startsWith('SP-')).map(a => a.asset_id));
const DETECTED = ['', 'Trip', 'Noise', 'Leak observed', 'Flow drop', 'Rounds reading', 'Inspection'];
const CONDITION = ['', 'Running', 'Starting', 'Standby', 'Stopped'];
const SRC_LABEL = { data: 'Data', ai: 'AI', user: 'User' } as const;
const php = (n: number) => `PHP ${Math.round(n).toLocaleString('en-US')}`;
const toLocalInput = (s: string) => s.replace(' ', 'T');
const MAX_PHOTOS = 4;
/** The signed-in technician files the report; supervisors and engineers default to the shift technician. */
const reporterDefault = () => { const u = useAuth.getState().user; return u?.role === 'technician' ? u.username : 'MT-02'; };

const WINDOWS = [{ days: 7, label: '1 week' }, { days: 14, label: '2 weeks' }, { days: 30, label: '1 month' }, { days: 42, label: '6 weeks' }, { days: 182, label: '6 months' }, { days: 365, label: '1 year' }];
const DEFAULT_TREND: TrendOpts = { days: 42, from: null, indicators: null };
const sameTrend = (a?: TrendOpts | null, b?: TrendOpts | null) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Section 3 trend charts (same layout as the PDF/DOCX), with the time range before the failure (preset or custom start
 *  date) and the indicators to chart. */
function TrendPanel({ trends, trend, indicators, failureDate, onChange, busy, children }: {
  trends: TrendSpec[]; trend: TrendOpts; indicators: TrendIndicator[]; failureDate?: string; onChange?: (o: TrendOpts) => void; busy?: boolean; children?: ReactNode;
}) {
  const avail = indicators.filter(i => i.available);
  const sel = trend.indicators ?? [];
  const toggle = (k: string) => {
    const next = sel.includes(k) ? sel.filter(x => x !== k) : [...sel, k];
    if (next.length) onChange?.({ ...trend, indicators: avail.map(i => i.key).filter(x => next.includes(x)) });
  };
  return (
    <>
      {onChange && (
        <div className="ir-trend-ctl no-print">
          <div className="ir-trend-range" role="group" aria-label="Time range before the failure">
            <span className="muted small">Range before failure</span>
            {WINDOWS.map(w => <button key={w.days} type="button" className={`btn sm${!trend.from && trend.days === w.days ? ' primary' : ' ghost'}`} disabled={busy}
              onClick={() => onChange({ ...trend, days: w.days, from: null })}>{w.label}</button>)}
            <label className={`ir-trend-from small${trend.from ? ' on' : ''}`}>Custom from
              <input type="date" value={trend.from ?? ''} max={failureDate} disabled={busy} aria-label="Custom start date"
                onChange={e => onChange({ ...trend, from: e.target.value || null })} />
            </label>
            {busy && <span className="spin" />}
          </div>
          {avail.length > 0 && (
            <div className="ir-trend-ind" role="group" aria-label="Indicators to chart">
              <span className="muted small">Indicators</span>
              {avail.map(i => (
                <label key={i.key} className={`chip-check${sel.includes(i.key) ? ' on' : ''}`}>
                  <input type="checkbox" checked={sel.includes(i.key)} disabled={busy || (sel.length === 1 && sel.includes(i.key))} onChange={() => toggle(i.key)} />{i.label}
                </label>
              ))}
            </div>
          )}
          {children}
        </div>
      )}
      {!trends.length
        ? <p className="muted small">No condition readings recorded for this asset in this range (no trend chart).</p>
        : (
          <div className="ir-charts">
            {trends.map((t, i) => (
              <figure key={i} className="ir-chart">
                <div className="ir-chart-svg" dangerouslySetInnerHTML={{ __html: chartSvg(t, 515, 165) }} />
                <figcaption>{t.window_label ?? '6 weeks'} before the failure · {t.start_date} → {t.end_date}{t.agg ? ` · ${t.agg}` : ''}: {t.summary}</figcaption>
              </figure>
            ))}
          </div>
        )}
    </>
  );
}

/** Field 3 of a stored report (submitted or historical): change the range / indicators, preview, save to the report
 *  (its PDF is re-rendered with the new charts). */
function ReportTrend({ reportId, date }: { reportId: string; date: string }) {
  const [view, setView] = useState<{ trend: TrendOpts; saved: TrendOpts | null; indicators: TrendIndicator[]; trends: TrendSpec[] } | null>(null);
  const [busy, setBusy] = useState<'' | 'load' | 'save'>('load');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setView(null); setMsg(null); setBusy('load');
    fetchTrends({ report_id: reportId }).then(v => { if (live) setView({ trend: v.trend, saved: v.saved ?? v.trend, indicators: v.indicators, trends: v.trends }); })
      .catch(e => live && setMsg(e instanceof Error ? e.message : 'Could not load the trend')).finally(() => live && setBusy(''));
    return () => { live = false; };
  }, [reportId]);
  const change = async (o: TrendOpts) => {
    setBusy('load'); setMsg(null);
    try { const v = await fetchTrends({ report_id: reportId }, o); setView(w => (w ? { ...w, trend: v.trend, trends: v.trends } : w)); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Could not load the trend'); } finally { setBusy(''); }
  };
  const save = async () => {
    if (!view) return;
    setBusy('save'); setMsg(null);
    try { const v = await saveReportTrend(reportId, view.trend); setView(w => (w ? { ...w, saved: v.trend, trend: v.trend, trends: v.trends } : w)); setMsg('Saved – the report PDF and DOCX now use this range.'); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Could not save'); } finally { setBusy(''); }
  };
  if (!view) return <div className="ir-report-trend">{busy ? <span className="spin" /> : <p className="muted small">{msg}</p>}</div>;
  const dirty = !sameTrend(view.trend, view.saved);
  return (
    <div className="ir-report-trend">
      <h4>Readings before the failure</h4>
      <TrendPanel trends={view.trends} trend={view.trend} indicators={view.indicators} failureDate={date.slice(0, 10)} onChange={change} busy={busy !== ''}>
        <div className="q-actions">
          <button type="button" className="btn sm primary" disabled={!dirty || busy !== ''} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save range to report'}</button>
          {dirty && <button type="button" className="btn sm ghost" disabled={busy !== ''} onClick={() => view.saved && change(view.saved)}>Revert</button>}
          {msg && <span className="muted small">{msg}</span>}
        </div>
      </TrendPanel>
    </div>
  );
}

/** Section 10 photos: up to 4, resized in the browser, each with a caption. */
function PhotoPicker({ photos, setPhotos, onError }: { photos: ReportPhoto[]; setPhotos: (f: (p: ReportPhoto[]) => ReportPhoto[]) => void; onError: (m: string) => void }) {
  const add = async (files: FileList | null) => {
    if (!files) return;
    for (const f of [...files].slice(0, MAX_PHOTOS - photos.length)) {
      try { const p = await preparePhoto(f); setPhotos(ps => (ps.length < MAX_PHOTOS ? [...ps, p] : ps)); } catch { onError(`Could not read ${f.name} (use JPEG or PNG)`); }
    }
  };
  return (
    <div className="ir-photos">
      {photos.map((p, i) => (
        <figure key={p.url} className="ir-photo">
          <img src={p.url} alt={p.caption || `Photo ${i + 1}`} />
          <input value={p.caption} placeholder={`Caption for photo ${i + 1}`} aria-label={`Caption for photo ${i + 1}`}
            onChange={e => { const v = e.target.value; setPhotos(ps => ps.map((x, j) => (j === i ? { ...x, caption: v } : x))); }} />
          <button type="button" className="btn ghost sm no-print" onClick={() => setPhotos(ps => ps.filter((_, j) => j !== i))}>Remove</button>
        </figure>
      ))}
      {photos.length < MAX_PHOTOS && (
        <label className="ir-photo-add no-print">
          <Icon name="plus" size={16} /><span>Attach photo</span><span className="muted small">{photos.length}/{MAX_PHOTOS} · camera or gallery</span>
          <input type="file" accept="image/*" multiple onChange={e => { add(e.target.files); e.target.value = ''; }} />
        </label>
      )}
    </div>
  );
}

/** Photo 1 of a submitted report, shown beside its summary (hidden when the report has no photo). */
function SummaryPhoto({ reportId }: { reportId: string }) {
  const [ok, setOk] = useState(true);
  useEffect(() => setOk(true), [reportId]);
  if (!ok) return null;
  return <figure className="ir-summary-photo"><img src={`/api/incidents/${encodeURIComponent(reportId)}/photos/1`} alt="Photo 1" onError={() => setOk(false)} /><figcaption className="small muted">Photo 1</figcaption></figure>;
}

const blankForm = (asset = 'P-101B') => ({
  asset_id: asset, failure_at: toLocalInput(nowStamp()), reported_by: reporterDefault(), detected_by: '', operating_condition: '',
  observed: '', actions_taken: '', downtime_h: '', procedure_used: '', parts_used: '', safety_injury: 'None', shut_down: false,
});

export function Incidents() {
  const [rows, setRows] = useState<{ submitted: Row[]; history: Row[] }>({ submitted: [], history: [] });
  const [mode, setMode] = useState<'list' | 'new'>('list');
  const [selected, setSelected] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const match = (r: Row) => { const t = q.trim().toLowerCase(); return !t || [r.report_id, r.asset_id, r.severity, r.failure_mode, r.procedure_used, r.status, r.summary].some(v => String(v ?? '').toLowerCase().includes(t)); };
  const [form, setForm] = useState(blankForm());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<'' | 'draft' | 'docx' | 'submit' | 'pdf'>('');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ report_id: string; shut_down: boolean; asset_id: string } | null>(null);
  const [photos, setPhotos] = useState<ReportPhoto[]>([]);
  const [trendBusy, setTrendBusy] = useState(false);
  /** Field 3 range + indicators: kept across re-drafts, stored with the report on submit (draft.trend). */
  const [trend, setTrend] = useState<TrendOpts>(DEFAULT_TREND);
  const changeTrend = async (o: TrendOpts) => {
    if (!draft) return;
    setTrendBusy(true);
    try {
      const r = await fetchTrends({ asset_id: draft.asset_id, failure_at: draft.failure_at }, o);
      setTrend(r.trend);
      setDraft(d => (d ? { ...d, trend: r.trend, trend_indicators: r.indicators, tables: { ...(d.tables ?? {}), trends: r.trends } } : d));
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load the trend'); } finally { setTrendBusy(false); }
  };
  const intent = useIntent(s => s.incident);
  const pdfFail = (e: unknown) => setErr(e instanceof Error && /501|LibreOffice/.test(e.message)
    ? 'PDF export needs LibreOffice on the server (sudo apt install libreoffice-writer-nogui). Use Print → Save as PDF meanwhile.'
    : e instanceof Error ? e.message : 'PDF export failed');
  const downloadPdf = async (id: string) => {
    setBusy('pdf'); setErr(null);
    try {
      downloadBlob(await reportPdfBlob(id), `${id}.pdf`);
    } catch (e) { pdfFail(e); } finally { setBusy(''); }
  };
  const downloadDocx = async (id: string) => {
    setBusy('docx'); setErr(null);
    try { downloadBlob(await reportDocxBlob(id), `${id}.docx`); } catch (e) { setErr(e instanceof Error ? e.message : 'Render failed'); } finally { setBusy(''); }
  };
  const downloadDraftPdf = async () => {
    if (!draft) return;
    setBusy('pdf'); setErr(null);
    try { downloadBlob(await draftPdfBlob(draft, undefined, photos), `${draft.report_id}.pdf`); } catch (e) { pdfFail(e); } finally { setBusy(''); }
  };
  const setStatus = useStatusStore(s => s.setStatus);

  const refresh = () => getJSON<{ submitted: Row[]; history: Row[] }>('/api/incidents').then(setRows).catch(() => setErr('Backend offline – start it on :8000'));
  useEffect(() => { refresh(); window.addEventListener('gearcast:incidents', refresh); return () => window.removeEventListener('gearcast:incidents', refresh); }, []);
  useEffect(() => {
    if (!intent) return;
    const f = { ...blankForm(intent.asset_id), ...(intent.prefill ?? {}) };
    setForm(f); setDraft(null); setDone(null); setPhotos([]); setMode('new');
    useIntent.getState().clear('incident');
    if (intent.prefill) generate(f); // arriving from Troubleshoot: let Caster draft straight away
  }, [intent?.seq]);

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));
  const generate = async (f: typeof form = form) => {
    setBusy('draft'); setErr(null); setDone(null);
    try {
      // a different asset has other indicators: keep the range, let the server pick its default indicators
      const keep = draft && draft.asset_id === f.asset_id ? trend : { ...trend, indicators: null };
      const body = { ...f, failure_at: f.failure_at.replace('T', ' '), downtime_h: f.downtime_h === '' ? null : Number(f.downtime_h), trend: keep, sim: simPayload() };
      const d = await postJSON<Draft>('/api/incidents/draft', body);
      if (d.trend) setTrend(d.trend);
      setDraft(d);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Draft failed'); } finally { setBusy(''); }
  };
  const editField = (no: number, value: string) => setDraft(d => d && ({ ...d, fields: d.fields.map(f => (f.field_no === no ? { ...f, value, source: 'user' } : f)) }));
  const docx = async () => {
    if (!draft) return;
    setBusy('docx');
    try { downloadBlob(await draftDocxBlob(draft, photos), `${draft.report_id}.docx`); } catch (e) { setErr(e instanceof Error ? e.message : 'Render failed'); } finally { setBusy(''); }
  };
  const submit = async () => {
    if (!draft) return;
    setBusy('submit');
    try {
      const r = await postJSON<{ report_id: string; shut_down: boolean; asset_id: string; status_change?: { new_status: string; reason: string } }>('/api/incidents', { ...draft, shut_down: form.shut_down, photos: photoMeta(photos) });
      if (r.status_change) setStatus(r.asset_id, r.status_change.new_status, r.status_change.reason);
      let photoErr: string | null = null;
      if (photos.length) await uploadReportPhotos(r.report_id, photos).catch(e => { photoErr = e instanceof Error ? e.message : 'Photo upload failed'; });
      await storeReportPdf(r.report_id).catch(() => { /* rendered on first download instead */ });
      setDone(r); setDraft(null); setPhotos([]); refresh();
      if (photoErr) setErr(`${r.report_id} submitted, but a photo was not stored: ${photoErr}`);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Submit failed'); } finally { setBusy(''); }
  };

  const sections = useMemo(() => {
    const out = new Map<string, Field[]>();
    for (const f of [...(draft?.fields ?? [])].sort((a, b) => parseInt(a.section) - parseInt(b.section) || a.field_no - b.field_no)) {
      out.set(f.section, [...(out.get(f.section) ?? []), f]);
    }
    return [...out.entries()];
  }, [draft]);
  const srcCount = (s: Field['source']) => draft?.fields.filter(f => f.source === s).length ?? 0;

  return (
    <div className="page">
      <header className="page-head row no-print">
        <div>
          <h1>Incidents</h1>
          <p>Incident reports — required before an asset is taken out of service. Caster drafts the 37-field report from the records.</p>
        </div>
        {mode === 'list'
          ? <button type="button" className="btn primary" onClick={() => { setMode('new'); setDraft(null); setDone(null); setPhotos([]); }}><Icon name="plus" size={14} />New incident</button>
          : <button type="button" className="btn" onClick={() => setMode('list')}>Back to list</button>}
      </header>
      {err && <div className="alert-box bad no-print">{err}</div>}

      {mode === 'list' && (
        <div className="ir-layout">
          <div className="card pm-table-card">
            <div className="pm-table-head">
              <b>Incident reports</b>
              <input className="sp-search pm-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search report, asset, failure, procedure…" aria-label="Search incidents" />
              <span className="muted small">{[...rows.submitted, ...rows.history].filter(match).length} reports</span>
            </div>
            <div className="table-wrap">
              <table className="ir-table">
                <thead><tr><th>Report</th><th>Date</th><th>Asset</th><th>Severity</th><th>Failure</th><th>Procedure</th><th className="num">Repair (PHP)</th><th className="num">Loss (PHP)</th><th>Status</th></tr></thead>
                <tbody>
                  {[...rows.submitted, ...rows.history].filter(match).map(r => (
                    <tr key={r.report_id} className={selected?.report_id === r.report_id ? 'active' : ''} onClick={() => { setSelected(r); setOpen(true); }}>
                      <td className="mono">{r.report_id}{r.source === 'submitted' && <span className="badge new">new</span>}</td>
                      <td className="mono">{shortDate(r.date)}</td>
                      <td className="mono tag">{r.asset_id}</td>
                      <td>{r.severity ? <span className={`sev sev-${String(r.severity).toLowerCase().replace(' ', '-')}`}>{r.severity}</span> : '—'}</td>
                      <td className="ir-fail">{r.failure_mode || '—'}</td>
                      <td className="mono">{r.procedure_used || '—'}</td>
                      <td className="num mono">{r.repair_cost_php != null ? Math.round(r.repair_cost_php).toLocaleString('en-US') : '—'}</td>
                      <td className="num mono">{r.production_loss_php != null ? Math.round(r.production_loss_php).toLocaleString('en-US') : '—'}</td>
                      <td className="small">{r.shut_down ? <span className="badge warn">Shut down</span> : r.status || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {selected && (
            <aside className={`rr-drawer${open ? ' open' : ''}`} aria-hidden={!open}>
              <button type="button" className="rr-drawer-close btn ghost sm" onClick={() => setOpen(false)} aria-label="Collapse panel">›</button>
              <div className="card rr-detail ir-detail">
                <div className="sym-head"><span className="mono sym-id">{selected.report_id}</span><b>{selected.asset_id}</b>
                  {selected.severity && <span className={`sev sev-${String(selected.severity).toLowerCase().replace(' ', '-')}`}>{selected.severity}</span>}
                  <span className="muted">{fmtDate(selected.date)}</span></div>
                {selected.failure_mode && <p><b>{selected.failure_mode}</b></p>}
                <div className="ir-summary-row">
                  <p className="ir-summary">{selected.summary || 'No summary recorded.'}</p>
                  {selected.source === 'submitted' && <SummaryPhoto reportId={selected.report_id} />}
                </div>
                <div className="q-actions">
                  <button type="button" className="btn sm" onClick={() => openAsset(selected.asset_id)}><Icon name="plant" size={13} />Open {selected.asset_id}</button>
                  <button type="button" className="btn sm" disabled={busy === 'pdf'} onClick={() => downloadPdf(selected.report_id)}><Icon name="download" size={13} />{busy === 'pdf' ? 'Preparing…' : 'Download PDF'}</button>
                  <button type="button" className="btn sm" disabled={busy === 'docx'} onClick={() => downloadDocx(selected.report_id)}><Icon name="download" size={13} />{busy === 'docx' ? 'Preparing…' : 'DOCX'}</button>
                </div>
                <ReportTrend reportId={selected.report_id} date={selected.date} />
              </div>
            </aside>
          )}
          {selected && !open && <button type="button" className="rr-drawer-tab" onClick={() => setOpen(true)} aria-label="Show report">‹ Report</button>}
        </div>
      )}

      {mode === 'new' && (
        <div className="ir-new">
          {done && (
            <div className="alert-box ok no-print">
              <b>{done.report_id}</b> submitted.{done.shut_down ? ` ${done.asset_id} is now Shut Down.` : ''}
              <button type="button" className="btn sm" onClick={() => openAsset(done.asset_id)}><Icon name="plant" size={13} />View on overview</button>
            </div>
          )}
          <form className="card ir-form no-print" onSubmit={e => { e.preventDefault(); generate(); }}>
            <div className="form-grid">
              <label>Asset<select value={form.asset_id} onChange={e => set('asset_id', e.target.value)}>{ASSETS.map(a => <option key={a}>{a}</option>)}</select></label>
              <label>Date &amp; time of failure<input type="datetime-local" value={form.failure_at} onChange={e => set('failure_at', e.target.value)} /></label>
              <label>Reported by (role code)<input value={form.reported_by} onChange={e => set('reported_by', e.target.value)} /></label>
              <label>How detected<select value={form.detected_by} onChange={e => set('detected_by', e.target.value)}>{DETECTED.map(a => <option key={a} value={a}>{a || 'Let Caster infer'}</option>)}</select></label>
              <label>Operating condition<select value={form.operating_condition} onChange={e => set('operating_condition', e.target.value)}>{CONDITION.map(a => <option key={a} value={a}>{a || 'Let Caster infer'}</option>)}</select></label>
              <label>Downtime so far (h)<input type="number" min="0" step="0.5" value={form.downtime_h} onChange={e => set('downtime_h', e.target.value)} /></label>
              <label className="span2">What was observed (technician notes)<textarea rows={3} value={form.observed} onChange={e => set('observed', e.target.value)} placeholder="What you saw, heard and measured…" /></label>
              <label className="span2">Actions taken (with times)<textarea rows={3} value={form.actions_taken} onChange={e => set('actions_taken', e.target.value)} placeholder="14:25 started standby P-101A; 14:30 LOTO…" /></label>
              <label>Procedure used<input value={form.procedure_used} onChange={e => set('procedure_used', e.target.value)} placeholder="e.g. PR-06" /></label>
              <label>Parts used<input value={form.parts_used} onChange={e => set('parts_used', e.target.value)} placeholder="blank = from procedure" /></label>
              <label>Safety / injury<select value={form.safety_injury} onChange={e => set('safety_injury', e.target.value)}>{['None', 'Near miss', 'Injury'].map(a => <option key={a}>{a}</option>)}</select></label>
              <label className="toggle"><input type="checkbox" checked={form.shut_down} onChange={e => set('shut_down', e.target.checked)} />
                <span><b>Shut down {form.asset_id}</b><br /><span className="muted small">Submitting sets the asset to Shut Down</span></span></label>
              <div className="span2 ir-form-photos">
                <span className="ir-form-label">Photos (up to {MAX_PHOTOS}, printed in section 10 with captions)</span>
                <PhotoPicker photos={photos} setPhotos={setPhotos} onError={setErr} />
              </div>
            </div>
            <div className="q-actions">
              <button type="submit" className="btn primary" disabled={busy !== '' || !form.observed.trim()}>
                {busy === 'draft' ? <><Caster size={18} state="thinking" />Drafting…</> : <><Icon name="spark" size={14} />Generate draft</>}
              </button>
              {!form.observed.trim() && <span className="muted small">Add what was observed to generate a draft.</span>}
            </div>
          </form>

          {draft && (
            <div className="card ir-draft">
              <div className="ir-draft-head no-print">
                <div>
                  <div className="sym-head"><span className="mono sym-id">{draft.report_id}</span><b>Draft incident report · {draft.asset_id}</b></div>
                  <div className="src-legend">
                    <span className="src src-data">Data {srcCount('data')}</span><span className="src src-ai">AI {srcCount('ai')}</span><span className="src src-user">User {srcCount('user')}</span>
                    <span className="muted small">Every field is editable; edits become “User”.</span>
                  </div>
                </div>
                <div className="q-actions">
                  <button type="button" className="btn" onClick={docx} disabled={busy !== ''}><Icon name="download" size={14} />{busy === 'docx' ? 'Rendering…' : 'Download DOCX'}</button>
                  <button type="button" className="btn" disabled={busy === 'pdf'} onClick={downloadDraftPdf}><Icon name="download" size={14} />Download PDF</button>
                  <button type="button" className="btn" onClick={() => window.print()}><Icon name="print" size={14} />Print</button>
                  <button type="button" className={`btn ${form.shut_down ? 'danger' : 'primary'}`} onClick={submit} disabled={busy !== ''}>
                    {busy === 'submit' ? 'Submitting…' : form.shut_down ? `Submit & shut down ${draft.asset_id}` : 'Submit report'}
                  </button>
                </div>
              </div>
              {!!draft.warnings.length && <div className="alert-box warn no-print">{draft.warnings.join(' · ')}</div>}
              <div className="ir-tiles no-print">
                <div className={`tile${draft.linked.cost.pair_down ? ' tile-bad' : ''}`}><span>Total cost estimate</span><b>{php(draft.linked.cost.total)}</b><em>{draft.linked.cost.explanation.replace(/^PHP [\d,]+ – /, '')}</em></div>
                <div className="tile"><span>Repair estimate</span><b>{php(draft.linked.cost.repair)}</b><em>labour {php(draft.linked.cost.labour)} · parts {php(draft.linked.cost.parts)}</em></div>
                <div className="tile"><span>Repair or replace</span><b>{draft.linked.repair_or_replace.recommendation}</b><em>RR-Model v1 · {(draft.linked.repair_or_replace.confidence * 100).toFixed(0)}% confidence</em></div>
                <div className="tile"><span>Standby</span><b>{draft.linked.standby}</b><em>stored spare {draft.linked.spare ?? '—'}</em></div>
              </div>
              <div className="no-print"><CostBreakdown est={draft.linked.cost} /></div>
              {(draft.summary || photos[0]) && (
                <div className={`ir-summary-box${photos[0] ? ' with-photo' : ''}`}>
                  <div><span className="muted small">Summary</span><p>{draft.summary || '—'}</p></div>
                  {photos[0] && <figure className="ir-summary-photo"><img src={photos[0].url} alt={photos[0].caption || 'Photo 1'} /><figcaption className="small muted">Photo 1{photos[0].caption ? ` – ${photos[0].caption}` : ''}</figcaption></figure>}
                </div>
              )}
              <div className="print-only print-title">INCIDENT REPORT · {draft.report_id} · Franklin Baker – Darong WWTP · Printed from GearCast</div>
              {sections.map(([sec, fs]) => (
                <section key={sec} className="ir-sec">
                  <h3>{sec}</h3>
                  {fs.map(f => (
                    <div key={f.field_no} className="ir-field">
                      <div className="ir-label">
                        <span>{f.field}</span>
                        <span className={`src src-${f.source}`} title={`Filled by: ${f.filled_by}`}>{SRC_LABEL[f.source]}</span>
                      </div>
                      <textarea className="ir-value" value={f.value ?? ''} rows={Math.min(6, Math.max(1, String(f.value ?? '').split('\n').length + Math.floor(String(f.value ?? '').length / 90)))}
                        onChange={e => editField(f.field_no, e.target.value)} aria-label={f.field} />
                      <div className="print-only ir-print-val">{f.value}</div>
                      {f.field_no === 12 && <TrendPanel trends={draft.tables?.trends ?? []} trend={draft.trend ?? trend} indicators={draft.trend_indicators ?? []}
                        failureDate={draft.failure_at?.slice(0, 10)} onChange={changeTrend} busy={trendBusy} />}
                      {f.field_no === 35 && <PhotoPicker photos={photos} setPhotos={setPhotos} onError={setErr} />}
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


import { useEffect, useState } from 'react';
import { PLANT } from '../data';
import { getJSON } from '../api/client';
import { Icon } from '../shell/icons';
import { openAsset } from '../shell/TopBar';
import { useIntent } from '../store/intentStore';
import { useCan } from '../store/authStore';
import '../styles/pages.css';

interface Rule { id: string; label: string; value: number | string; limit: number | string; fired: boolean }
interface Factor { feature: string; value: string; weight: number }
interface Prediction {
  recommendation: string; confidence: number; rules: Rule[]; factors: Factor[];
  costs: { repair_now_php: number; replace_now_php: number; repair_cost_ratio: number; repair_3y_php: number; replace_3y_php: number;
    cheaper_over_3y: string; savings_3y_php: number; savings_note: string; assumptions: string[] };
  downtime?: { loss_per_failure_php: number; note: string };
  features: { asset_age_years: number; failures_last_12m: number; spare_ready: boolean };
}
interface CaseRow { case: Record<string, any>; failure_mode?: string; prediction: Prediction; agrees_with_record: boolean }
interface ModelInfo { name: string; kind: string; trained_on: string; features: string[] }
interface Supplier { supplier_id: string; supplier_name: string; supplier_type: string; supplies: string; location: string; phone: string; email: string; lead_time_days: number | null; basis: string; why: string; source_id: string | null; website: string | null; contact: string | null }
interface Source { id: string; description: string | null; link: string | null }
interface OptCost { php: number; cost_id: string; item: string; basis: string; source_id: string; budget: boolean; note: string | null }
interface Pick { kind: string; brand: string | null; model: string | null; supplier_name: string; lead_time_days: number | null; contact: string | null; website: string | null; new_unit_cost_php: number | null; cost_budget: boolean; text: string }
interface Replacement {
  asset_id: string; asset_type: string; class_label: string | null; placeholder: boolean; note: string; no_alternative_note: string | null;
  installed: { brand: string | null; model: string | null; duty: string | null; new_unit_cost_php: number | null; cost_basis: string | null; basis: string | null; sources: (Source | null)[] };
  options: { kind: string; brand: string | null; model: string | null; why: string | null; found_in: string[]; sources: Source[]; new_unit_cost_php: number | null; cost: OptCost | null; suppliers: Supplier[] }[];
  recommended: Pick | null; fastest_alternative: Pick | null;
  services: { kind: string; note: string | null; cost_php: number | null; cost_item: string | null; cost_basis: string | null; suppliers: Supplier[] }[];
  parts: { part_id: string; part_name: string; part_number: string | null; qty_on_hand: number; min_qty: number; unit: string; unit_cost_php: number | null; lead_time_days: number | null; storage_location: string | null; supplier: string | null }[];
}

const php = (n: number) => `PHP ${Math.round(n).toLocaleString('en-US')}`;
const tone = (r: string) => (r.startsWith('Replace') ? 'bad' : r.includes('watch') ? 'warn' : 'ok');
const ASSETS = PLANT.equipment.map(a => a.asset_id);

/** 2025-06-10 -> 06/10/25 */
const shortDate = (d: string) => { const [y, m, dd] = d.slice(0, 10).split('-'); return `${m}/${dd}/${y.slice(2)}`; };

export function RepairReplace() {
  const [data, setData] = useState<{ model: ModelInfo; cases: CaseRow[] } | null>(null);
  const [sel, setSel] = useState<string>('');
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState<{ asset: string; cost: string; result: (Prediction & { asset_id: string }) | null }>({ asset: 'P-101B', cost: '', result: null });
  const [err, setErr] = useState<string | null>(null);
  const edit = useCan('rr.edit');

  useEffect(() => { getJSON<{ model: ModelInfo; cases: CaseRow[] }>('/api/rr/cases').then(setData).catch(() => setErr('Backend offline – start it on :8000')); }, []);
  const intent = useIntent(s => s.rr);
  useEffect(() => {
    if (!intent) return;
    useIntent.getState().clear('rr');
    setLive(l => ({ ...l, asset: intent.asset_id, cost: '' }));
    check(intent.asset_id, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent?.seq]);
  const check = async (asset = live.asset, cost = live.cost) => {
    try {
      const q = cost ? `?repair_cost_php=${Number(cost)}` : '';
      setLive(l => ({ ...l, result: null }));
      const r = await getJSON<Prediction & { asset_id: string }>(`/api/rr/predict/${asset}${q}`);
      setLive(l => ({ ...l, result: r })); setSel(''); setOpen(true);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Prediction failed'); }
  };
  const row = data?.cases.find(c => c.case.case_id === sel);
  const pred = sel ? row?.prediction : live.result;
  const count = (k: string) => data?.cases.filter(c => tone(c.prediction.recommendation) === k).length ?? 0;

  return (
    <div className="page">
      <header className="page-head">
        <h1>Repair / Replace</h1>
        <p>Per-failure decision with costs, plant rules, downtime exposure and 3-year savings.</p>
      </header>
      {err && <div className="alert-box bad">{err}</div>}
      {data && (
        <>
          <div className="model-strip card">
            <Icon name="spark" size={16} />
            <b>{data.model.name}</b><span className="muted">· {data.model.kind} · trained on {data.model.trained_on}</span>
            <span className="model-tiles">
              <span className="tile-mini bad">Replace <b>{count('bad')}</b></span>
              <span className="tile-mini warn">Repair – watch <b>{count('warn')}</b></span>
              <span className="tile-mini ok">Repair <b>{count('ok')}</b></span>
              <span className="tile-mini">Agrees with record <b>{data.cases.filter(c => c.agrees_with_record).length}/{data.cases.length}</b></span>
            </span>
          </div>
          <div className="rr-layout">
            <div className="card rr-table-card">
              <table className="tbl">
                <thead><tr><th>Case</th><th>Date</th><th>Asset</th><th>Failure</th><th className="num">Repair</th><th className="num">% new</th><th>Model</th><th className="num">Conf.</th></tr></thead>
                <tbody>
                  {data.cases.map(c => (
                    <tr key={c.case.case_id} className={sel === c.case.case_id ? 'active' : ''} onClick={() => { setSel(c.case.case_id); setOpen(true); }}>
                      <td className="mono">{c.case.case_id}</td><td className="mono">{shortDate(c.case.decision_date)}</td><td className="mono tag">{c.case.asset_id}</td>
                      <td className="ellip">{c.failure_mode}</td><td className="num mono">{Math.round(c.case.repair_cost_php).toLocaleString('en-US')}</td>
                      <td className="num mono">{(c.case.repair_cost_ratio * 100).toFixed(1)}%</td>
                      <td><span className={`rec ${tone(c.prediction.recommendation)}`}>{c.prediction.recommendation}</span></td>
                      <td className="num mono">{(c.prediction.confidence * 100).toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="rr-live">
                <b>Check an asset now</b>
                <select value={live.asset} onChange={e => setLive(l => ({ ...l, asset: e.target.value }))}>{ASSETS.map(a => <option key={a}>{a}</option>)}</select>
                {edit && <input type="number" min="0" placeholder="Repair quote (PHP), blank = last repair" value={live.cost} onChange={e => setLive(l => ({ ...l, cost: e.target.value }))} />}
                <button type="button" className="btn primary sm" onClick={() => check()}>{edit ? 'Run model' : 'View'}</button>
                {!edit && <span className="muted small">View only for technicians</span>}
              </div>
            </div>
            {pred && (
              <aside className={`rr-drawer${open ? ' open' : ''}`} aria-hidden={!open}>
                <button type="button" className="rr-drawer-close btn ghost sm" onClick={() => setOpen(false)} aria-label="Collapse panel">›</button>
                <RrDetail p={pred} title={row ? `${row.case.case_id} · ${row.case.asset_id}` : `Live check · ${live.result?.asset_id}`} assetId={row?.case.asset_id ?? live.result?.asset_id} actual={row?.case.actual_decision} />
              </aside>
            )}
            {pred && !open && <button type="button" className="rr-drawer-tab" onClick={() => setOpen(true)} aria-label="Show details">‹ Details</button>}
          </div>
        </>
      )}
    </div>
  );
}

function RrDetail({ p, title, assetId, actual }: { p: Prediction; title: string; assetId?: string; actual?: string }) {
  const max = Math.max(...p.factors.map(f => Math.abs(f.weight)), 0.01);
  const cmax = Math.max(p.costs.repair_3y_php, p.costs.replace_3y_php, 1);
  const [rep, setRep] = useState<Replacement | null>(null);
  useEffect(() => {
    setRep(null);
    if (assetId) getJSON<Replacement>(`/api/rr/replacement/${encodeURIComponent(assetId)}`).then(setRep).catch(() => setRep(null));
  }, [assetId]);
  const replace = p.recommendation.startsWith('Replace');
  return (
    <div className="card rr-detail">
      <div className="sym-head"><b>{title}</b>{assetId && <button type="button" className="btn ghost sm" onClick={() => openAsset(assetId)}>Open asset</button>}</div>
      <div className={`rr-verdict ${tone(p.recommendation)}`}>
        <div><span className="muted small">Recommendation</span><b>{p.recommendation}</b></div>
        <div className="conf"><span className="muted small">Confidence</span><b className="mono">{(p.confidence * 100).toFixed(0)}%</b>
          <div className="conf-bar"><i style={{ width: `${p.confidence * 100}%` }} /></div></div>
      </div>
      {rep?.recommended && (
        <div className={`rr-replace-with${replace ? ' on' : ''}`}>
          <span className="muted small">{replace ? 'Replace with' : 'If replaced'}</span>
          <div><b>{rep.recommended.brand ?? 'Equivalent unit'}</b> {rep.recommended.model}</div>
          <div className="small">from <b>{rep.recommended.supplier_name}</b>
            {rep.recommended.lead_time_days != null && <> · ~{rep.recommended.lead_time_days} d lead time</>}
            {rep.recommended.new_unit_cost_php ? <> · {rep.recommended.cost_budget ? 'budget ' : ''}{php(rep.recommended.new_unit_cost_php)}</> : null}
            {rep.recommended.contact && <span className="muted"> · {rep.recommended.contact}</span>}</div>
          {rep.fastest_alternative && <div className="small muted">Fastest alternative: {rep.fastest_alternative.text}</div>}
        </div>
      )}
      {actual && <p className="small muted">Recorded decision: {actual}</p>}

      <h4>Top factors <span className="muted small">(→ replace · ← repair)</span></h4>
      <div className="shap">
        {p.factors.map(f => (
          <div key={f.feature} className="shap-row">
            <span className="shap-name">{f.feature}<em className="mono">{f.value}</em></span>
            <span className="shap-axis">
              <span className={`shap-bar ${f.weight >= 0 ? 'pos' : 'neg'}`} style={{ width: `${(Math.abs(f.weight) / max) * 50}%`, [f.weight >= 0 ? 'left' : 'right']: '50%' } as React.CSSProperties} />
            </span>
            <span className="mono shap-w">{f.weight >= 0 ? '+' : ''}{f.weight.toFixed(2)}</span>
          </div>
        ))}
      </div>

      <h4>Plant rules</h4>
      <table className="tbl compact">
        <thead><tr><th>Rule</th><th>Value</th><th>Limit</th><th>Result</th></tr></thead>
        <tbody>{p.rules.map(r => (
          <tr key={r.id}><td><span className="mono">{r.id}</span> {r.label}</td><td className="mono">{String(r.value)}</td><td className="mono">{String(r.limit)}</td>
            <td><span className={`rec ${r.fired ? 'bad' : 'ok'}`}>{r.fired ? 'FIRES' : 'PASS'}</span></td></tr>))}</tbody>
      </table>

      <h4>Cost comparison</h4>
      <div className="cost-cmp">
        <div><span>Repair now</span><b className="mono">{php(p.costs.repair_now_php)}</b><em>{(p.costs.repair_cost_ratio * 100).toFixed(1)}% of new</em></div>
        <div><span>Replace now</span><b className="mono">{php(p.costs.replace_now_php)}</b><em>new unit</em></div>
      </div>
      <div className="bars3">
        <div className="bar3"><span>Repair path · 3 yr</span><i style={{ width: `${(p.costs.repair_3y_php / cmax) * 100}%` }} className="b-repair" /><b className="mono">{php(p.costs.repair_3y_php)}</b></div>
        <div className="bar3"><span>Replace path · 3 yr</span><i style={{ width: `${(p.costs.replace_3y_php / cmax) * 100}%` }} className="b-replace" /><b className="mono">{php(p.costs.replace_3y_php)}</b></div>
      </div>
      <div className={`alert-box ${p.costs.savings_3y_php >= 0 ? 'ok' : 'warn'}`}>{p.costs.savings_note}</div>
      {p.downtime && <p className="small"><b>Downtime:</b> {p.downtime.note}</p>}
      <p className="small muted">Assumptions: {p.costs.assumptions.join(' · ')}</p>
      {rep && <ReplacementOptions r={rep} />}
    </div>
  );
}

const srcTitle = (x: Source) => [x.id, x.description].filter(Boolean).join(' – ');
const SourceRefs = ({ list }: { list: (Source | null)[] }) => {
  const xs = list.filter((x): x is Source => !!x);
  if (!xs.length) return null;
  return <>{xs.map((x, i) => <span key={x.id}>{i ? ', ' : ''}{x.link ? <a href={x.link} target="_blank" rel="noreferrer" title={srcTitle(x)}>{x.id}</a> : <span title={srcTitle(x)}>{x.id}</span>}</span>)}</>;
};
const SupplierLine = ({ s }: { s: Supplier }) => (
  <div className="rr-sup small">
    <b>{s.supplier_name}</b> <span className="muted">· {s.location}{s.lead_time_days != null ? ` · ~${s.lead_time_days} d lead time` : ' · lead time not on file'}</span>
    <div className="muted">{s.supplies}
      {s.contact ? ` · ${s.contact}` : ''}
      {!s.contact && s.website ? <> · <a href={s.website} target="_blank" rel="noreferrer">website</a></> : null}
      {s.basis !== 'Sourced' ? ` · (${/to confirm/i.test(s.supplier_name) ? 'to confirm' : s.basis})` : ''}</div>
  </div>
);

/** Brands and suppliers for a replacement unit, repair services, plus the parts (and their suppliers) for a repair. */
function ReplacementOptions({ r }: { r: Replacement }) {
  return (
    <>
      <h4>Replacement options · brands &amp; suppliers</h4>
      {r.placeholder && <div className="alert-box warn small">Placeholder asset – brand, model and price to confirm with the raw data update. Options below are for the same 50 m³/h transfer duty.</div>}
      <p className="small">Installed: <b>{r.installed.brand ?? '—'}</b> {r.installed.model ?? ''}
        {r.installed.duty && <span className="muted"> · {r.installed.duty}</span>}
        {r.installed.new_unit_cost_php ? <span className="muted"> · new unit {php(r.installed.new_unit_cost_php)}{r.installed.cost_basis ? ` (${r.installed.cost_basis})` : ''}</span> : null}
        {r.installed.sources.some(Boolean) && <span className="muted"> · source <SourceRefs list={r.installed.sources} /></span>}</p>
      <div className="rr-opts">
        {r.options.map((o, i) => (
          <div key={i} className="rr-opt">
            <div className="rr-opt-head"><span className="badge">{o.kind}</span><b>{o.brand ?? 'Brand per distributor stock'}</b><span className="muted small">{o.model}</span>
              {o.cost && <span className="rr-opt-cost mono small" title={o.cost.note ?? undefined}>{o.cost.budget ? 'budget ' : ''}{php(o.cost.php)}</span>}</div>
            {o.why && <div className="small">{o.why}</div>}
            {o.suppliers.map(s => <SupplierLine key={s.supplier_id} s={s} />)}
            {!o.suppliers.length && <div className="muted small">No Philippine supplier for this brand in the data package – request quotes.</div>}
            <div className="muted small rr-basis">
              {o.cost && <>Cost: {o.cost.item} ({o.cost.cost_id}, {o.cost.basis}){o.cost.budget ? ' – budget, no brand price on file' : ''}{o.cost.note && !o.cost.budget ? ` · ${o.cost.note}` : ''}. </>}
              {o.sources.length > 0 && <>Source: <SourceRefs list={o.sources} />. </>}
              {o.found_in.length > 0 && <>Found in: {o.found_in.join('; ')}.</>}
            </div>
          </div>
        ))}
        {!r.options.length && <p className="muted small">No replacement brands on file for this asset type.</p>}
        {r.no_alternative_note && <p className="muted small">{r.no_alternative_note}</p>}
      </div>
      {r.services.length > 0 && <>
        <h4>Repair services</h4>
        <div className="rr-opts">{r.services.map((sv, i) => (
          <div key={i} className="rr-opt">
            <div className="rr-opt-head"><span className="badge">{sv.kind}</span>{sv.cost_php ? <span className="rr-opt-cost mono small">{php(sv.cost_php)}</span> : null}</div>
            {sv.suppliers.map(s => <SupplierLine key={s.supplier_id} s={s} />)}
            <div className="muted small rr-basis">{sv.note}{sv.cost_item ? ` · ${sv.cost_item} (${sv.cost_basis})` : ''}</div>
          </div>))}</div>
      </>}
      {r.parts.length > 0 && <>
        <h4>Parts for a repair</h4>
        <table className="tbl compact">
          <thead><tr><th>Part</th><th>Supplier</th><th className="num">Stock</th><th className="num">Lead</th></tr></thead>
          <tbody>{r.parts.map(p => (
            <tr key={p.part_id}><td>{p.part_name}{p.part_number && <div className="muted small">{p.part_number}</div>}</td><td className="small">{p.supplier ?? '—'}</td>
              <td className={`num mono${p.qty_on_hand < p.min_qty ? ' bad-t' : ''}`}>{p.qty_on_hand} {p.unit}</td><td className="num mono">{p.lead_time_days != null ? `${p.lead_time_days} d` : '—'}</td></tr>))}</tbody>
        </table>
      </>}
      <p className="small muted">{r.note}</p>
    </>
  );
}

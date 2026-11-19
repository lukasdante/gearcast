import { useEffect, useState } from 'react';
import { PLANT } from '../data';
import { getJSON } from '../api/client';
import { Icon } from '../shell/icons';
import { openAsset } from '../shell/TopBar';
import { fmtDate } from '../domain/assetInfo';
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

const php = (n: number) => `PHP ${Math.round(n).toLocaleString('en-US')}`;
const tone = (r: string) => (r.startsWith('Replace') ? 'bad' : r.includes('watch') ? 'warn' : 'ok');
const ASSETS = PLANT.equipment.map(a => a.asset_id);

export function RepairReplace() {
  const [data, setData] = useState<{ model: ModelInfo; cases: CaseRow[] } | null>(null);
  const [sel, setSel] = useState<string>('RR-03');
  const [live, setLive] = useState<{ asset: string; cost: string; result: (Prediction & { asset_id: string }) | null }>({ asset: 'P-101B', cost: '', result: null });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { getJSON<{ model: ModelInfo; cases: CaseRow[] }>('/api/rr/cases').then(setData).catch(() => setErr('Backend offline – start it on :8000')); }, []);
  const check = async () => {
    try {
      const q = live.cost ? `?repair_cost_php=${Number(live.cost)}` : '';
      setLive(l => ({ ...l, result: null }));
      const r = await getJSON<Prediction & { asset_id: string }>(`/api/rr/predict/${live.asset}${q}`);
      setLive(l => ({ ...l, result: r })); setSel('');
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
                    <tr key={c.case.case_id} className={sel === c.case.case_id ? 'active' : ''} onClick={() => setSel(c.case.case_id)}>
                      <td className="mono">{c.case.case_id}</td><td>{fmtDate(c.case.decision_date)}</td><td className="mono tag">{c.case.asset_id}</td>
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
                <input type="number" min="0" placeholder="Repair quote (PHP), blank = last repair" value={live.cost} onChange={e => setLive(l => ({ ...l, cost: e.target.value }))} />
                <button type="button" className="btn primary sm" onClick={check}>Run model</button>
              </div>
            </div>
            {pred && <RrDetail p={pred} title={row ? `${row.case.case_id} · ${row.case.asset_id}` : `Live check · ${live.result?.asset_id}`} assetId={row?.case.asset_id ?? live.result?.asset_id} actual={row?.case.actual_decision} />}
          </div>
        </>
      )}
    </div>
  );
}

function RrDetail({ p, title, assetId, actual }: { p: Prediction; title: string; assetId?: string; actual?: string }) {
  const max = Math.max(...p.factors.map(f => Math.abs(f.weight)), 0.01);
  const cmax = Math.max(p.costs.repair_3y_php, p.costs.replace_3y_php, 1);
  return (
    <div className="card rr-detail">
      <div className="sym-head"><b>{title}</b>{assetId && <button type="button" className="btn ghost sm" onClick={() => openAsset(assetId)}>Open asset</button>}</div>
      <div className={`rr-verdict ${tone(p.recommendation)}`}>
        <div><span className="muted small">Recommendation</span><b>{p.recommendation}</b></div>
        <div className="conf"><span className="muted small">Confidence</span><b className="mono">{(p.confidence * 100).toFixed(0)}%</b>
          <div className="conf-bar"><i style={{ width: `${p.confidence * 100}%` }} /></div></div>
      </div>
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
    </div>
  );
}

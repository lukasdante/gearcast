/**
 * "Estimated cost of this shutdown": production loss parts (Loss_Scenarios), repair, and the TOTAL.
 * The loss is PHP 0 while the standby can take over; when both units of a pair are down the plant curtails or stops
 * and the full scenario applies. Used in the incident draft, the asset Inspector and the Dashboard.
 */
import { useEffect, useMemo, useState } from 'react';
import '../styles/pages.css';
import { PLANT } from '../data';
import { postJSON, simPayload } from '../api/client';
import { getStatus, isDown, type StatusContext } from '../domain/status';
import { latestHistory } from '../domain/assetInfo';
import { useStatusCtx, useStatusStore } from '../store/statusStore';

export interface Loss {
  scenario: string | null; scenario_title?: string; outage_h: number; buffer_text: string; hours_beyond_buffer: number;
  lines_curtailed: string[]; response: string | null; lost_revenue: number; fine: number; restart_cost: number; overtime: number; production: number;
}
export interface CostEst {
  asset_id: string; group: string | null; partner: string | null; pair_down: boolean; outage_h: number;
  loss: Loss | null; production_loss: number; labour: number; parts: number; repair: number; total: number; explanation: string;
}

const php = (n: number) => `PHP ${Math.round(n || 0).toLocaleString('en-US')}`;
const DEFAULT_H = (g: string | null) => (g === 'Screens' ? 4 : g === 'Sump pumps' ? 3 : 8);

/** The flow-carrying pair an asset belongs to (motors and vibrator motors follow their pump/screen). */
export function pairOf(id: string): string[] {
  const a = PLANT.equipment.find(e => e.asset_id === id);
  if (!a?.pair_id) return [];
  return PLANT.equipment.filter(e => e.pair_id === a.pair_id && !e.parent_asset && !/^M-/.test(e.asset_id) && e.location_node).map(e => e.asset_id);
}
/** Pairs whose every unit is down: the plant curtails or stops there. */
export function downPairs(ctx: StatusContext): string[][] {
  const seen = new Set<string>(), out: string[][] = [];
  for (const e of PLANT.equipment) {
    if (!e.pair_id || seen.has(e.pair_id)) continue;
    seen.add(e.pair_id);
    const ids = pairOf(e.asset_id);
    if (ids.length > 1 && ids.every(i => isDown(getStatus(ctx, i)))) out.push(ids);
  }
  return out;
}

/** Breakdown table. `hours` + `onHours` show an outage-hours input. */
export function CostBreakdown({ est, hours, onHours, compact }: { est: CostEst; hours?: number; onHours?: (h: number) => void; compact?: boolean }) {
  const l = est.loss;
  const rows: [string, number][] = est.pair_down && l
    ? [['Lost revenue (lines stopped + restart time)', l.lost_revenue], ['Fines (RA 9275 exposure)', l.fine], ['Restart of curtailed lines', l.restart_cost],
      ['Overtime', l.overtime], ['Repair – labour', est.labour], ['Repair – parts', est.parts]]
    : [['Production loss', 0], ['Repair – labour', est.labour], ['Repair – parts', est.parts]];
  return (
    <div className={`cost-box${est.pair_down ? ' down' : ''}${compact ? ' compact' : ''}`}>
      <div className="cost-head">
        <b>{est.pair_down ? 'PLANT IMPACT · ESTIMATED COST OF THIS SHUTDOWN' : 'ESTIMATED COST OF THIS SHUTDOWN'}</b>
        <span className="badge">Assumed – estimate</span>
      </div>
      <p className="cost-note">
        {est.pair_down && l
          ? <>Both {String(est.group || 'units').toLowerCase()} down ({[est.asset_id, est.partner].filter(Boolean).join(' + ')}) · {l.scenario_title || l.scenario} · {l.buffer_text} · {Number(l.hours_beyond_buffer).toFixed(1)} h beyond buffer
            {l.lines_curtailed.length ? <> · curtailed: {l.lines_curtailed.join(', ')}</> : null}</>
          : est.partner ? <>Standby {est.partner} available – no plant loss while it runs. Cost = repair only.</> : <>No paired unit; no plant loss modelled.</>}
      </p>
      {onHours && hours !== undefined && (
        <label className="cost-hours">Expected outage (h)
          <input type="number" min="0" step="0.5" value={hours} onChange={e => onHours(Math.max(0, Number(e.target.value) || 0))} />
        </label>
      )}
      <table className="mini-table cost-table"><tbody>
        {rows.map(([k, v]) => <tr key={k}><td>{k}</td><td className="num mono">{php(v)}</td></tr>)}
        <tr className="cost-total"><td>TOTAL COST ESTIMATE</td><td className="num mono">{php(est.total)}</td></tr>
      </tbody></table>
    </div>
  );
}

/** Repair estimate from the incident reports that shut the units down (status reason "… incident report IR-…"). */
function useRepairFromReports(ids: string[]) {
  const appended = useStatusStore(s => s.appended);
  const reportIds = useMemo(() => ids.map(id => /IR-\d{4}-\d{3}/.exec(latestHistory(id, appended)?.reason ?? '')?.[0]).filter((x): x is string => !!x), [ids.join(), appended]);
  const [rep, setRep] = useState({ labour: 0, parts: 0 });
  useEffect(() => {
    let live = true;
    Promise.all(reportIds.map(r => fetch(`/api/incidents/${r}`).then(x => (x.ok ? x.json() : null)).catch(() => null)))
      .then(rs => { if (live) setRep(rs.reduce((a, r) => ({ labour: a.labour + Number(r?.linked?.cost?.labour || 0), parts: a.parts + Number(r?.linked?.cost?.parts || 0) }), { labour: 0, parts: 0 })); });
    return () => { live = false; };
  }, [reportIds.join()]);
  return { ...rep, reports: reportIds };
}

/** Live estimate for an asset's pair (server loss model + repair from the shutdown reports). */
export function useShutdownCost(id: string, enabled: boolean) {
  const ctx = useStatusCtx();
  const ids = pairOf(id);
  const group = ids.length ? (/^(P-101)/.test(id) ? 'Transfer pumps' : /^P-201/.test(id) ? 'Sump pumps' : /^(SC-|VM-)/.test(id) ? 'Screens' : null) : null;
  const [hours, setHours] = useState(DEFAULT_H(group));
  const [est, setEst] = useState<CostEst | null>(null);
  const rep = useRepairFromReports(ids.length ? ids : [id]);
  const downKey = ids.map(i => getStatus(ctx, i)).join();
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    postJSON<CostEst>('/api/tools/loss_estimate', { asset_id: id, outage_h: hours, sim: simPayload() })
      .then(e => { if (live) setEst(e); }).catch(() => { if (live) setEst(null); });
    return () => { live = false; };
  }, [id, hours, downKey, enabled]);
  const withRepair = est && { ...est, labour: rep.labour, parts: rep.parts, repair: rep.labour + rep.parts, total: est.production_loss + rep.labour + rep.parts };
  return { est: withRepair, hours, setHours, reports: rep.reports };
}

/** Inspector section: shown when the asset (or its whole pair) is down. */
export function ShutdownEstimate({ id }: { id: string }) {
  const ctx = useStatusCtx();
  const own = isDown(getStatus(ctx, id));
  const { est, hours, setHours, reports } = useShutdownCost(id, own);
  if (!own || !est) return null;
  return (
    <div className="insp-cost">
      <CostBreakdown est={est} hours={hours} onHours={setHours} compact />
      <p className="muted small">Repair from {reports.length ? reports.join(', ') : 'no incident report yet (file one to add the repair estimate)'}.</p>
    </div>
  );
}

/** Dashboard banner: one breakdown per pair that is fully down. */
export function PlantDownBanner() {
  const ctx = useStatusCtx();
  const pairs = downPairs(ctx);
  if (!pairs.length) return null;
  return (
    <div className="card plant-down">
      <div className="plant-down-head"><span className="dot-fault" />Plant shutdown – {pairs.map(p => p.join(' + ')).join(' · ')} down, no standby left</div>
      <div className="plant-down-grid">{pairs.map(p => <PairCost key={p.join()} id={p[0]} />)}</div>
    </div>
  );
}
function PairCost({ id }: { id: string }) {
  const { est, hours, setHours } = useShutdownCost(id, true);
  return est ? <CostBreakdown est={est} hours={hours} onHours={setHours} /> : <div className="muted small">Estimating…</div>;
}

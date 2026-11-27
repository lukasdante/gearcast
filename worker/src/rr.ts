/** Repair-or-replace predictor "GearCast RR-Model v1" (port of backend rr.py: rules PRM-101..104 + cost model). */
import { CLOCK, D, SPARE_FOR, failuresFor } from './data';
import { fixed, fmtComma, fmtG, num, pct0, pyRound, pyStr, sortBy, truthy } from './py';
import { DAY, parseDt } from './time';

export const MODEL_INFO = {
  name: 'GearCast RR-Model v1',
  kind: 'gradient-boosted trees',
  trained_on: '11 historical repair cases + synthetic augmentation',
  features: ['repair_cost_ratio', 'failures_last_12m', 'asset_age_years', 'spare_ready', 'downtime_loss_php'],
  implementation_note: 'Predictor = plant decision rules PRM-101..104 + cost model; swap-in point for a trained model.',
};
const NEW_UNIT_FAILURES_PER_YEAR = 0.3;
const HORIZON_Y = 3;
const NEW_COST_BY_TYPE: [string, string][] = [['P-101', 'CR-01'], ['SP-P01', 'CR-01'], ['M-', 'CR-02'], ['SP-M01', 'CR-02'], ['P-201', 'CR-03'],
  ['SP-P02', 'CR-03'], ['SC-', 'CR-04'], ['VM-', 'CR-05'], ['SP-VM01', 'CR-05'],
  // pump-area transfer pumps (placeholders, same 50 m³/h duty as P-101A/B): indicative CR-01 until the raw data update
  ['P-301', 'CR-01'], ['P-401', 'CR-01'], ['P-501', 'CR-01']];

export function newUnitCost(aid: string): number {
  for (const [prefix, cr] of NEW_COST_BY_TYPE) if (aid.startsWith(prefix)) return num(D.costRef[cr].value, 0);
  return 0.0;
}

export interface Features {
  asset_id: string; repair_cost_php: number; new_unit_cost_php: number; asset_age_years: number; failures_last_12m: number;
  spare_ready: boolean; downtime_loss_php: number; avg_failure_cost_php: number | null;
}
const ratioOf = (f: Features) => (f.new_unit_cost_php ? f.repair_cost_php / f.new_unit_cost_php : 0.0);
const clip = (x: number, lo = -1.0, hi = 1.0) => Math.max(lo, Math.min(hi, x));

function rulePredict(f: Features) {
  const maxRatio = D.param('PRM-101', 0.5), maxFailures = D.param('PRM-102', 3), oldAge = D.param('PRM-103', 8), oldRatio = D.param('PRM-104', 0.4);
  const r = ratioOf(f);
  const rules: any[] = [
    { id: 'PRM-101', label: 'Repair cost > 50% of new', value: pyRound(r, 3), limit: maxRatio, fired: r > maxRatio, margin: (r - maxRatio) / maxRatio },
    { id: 'PRM-102', label: '3+ failures in 12 months', value: f.failures_last_12m, limit: maxFailures, fired: f.failures_last_12m >= maxFailures,
      margin: (f.failures_last_12m - (maxFailures - 0.5)) / maxFailures },
    { id: 'PRM-103/104', label: 'Old (≥ 8 y) and costly (> 40%)', value: `${fixed(f.asset_age_years, 1)} y · ${pct0(r)}`, limit: `${fmtG(oldAge)} y · ${pct0(oldRatio)}`,
      fired: f.asset_age_years > oldAge && r > oldRatio, margin: Math.min((f.asset_age_years - oldAge) / oldAge, (r - oldRatio) / oldRatio) },
  ];
  const replace = rules.some(x => x.fired);
  let decision: string, margin: number;
  if (replace) {
    decision = 'Replace';
    const fired = rules.filter(x => x.fired).map(x => x.margin);
    margin = Math.max(...fired) + 0.25 * (fired.length - 1);
  } else {
    decision = f.failures_last_12m >= 2 ? 'Repair – watch' : 'Repair';
    margin = -Math.max(...rules.map(x => x.margin));
  }
  const confidence = pyRound(0.5 + 0.48 * Math.tanh(3 * Math.abs(margin) + 0.15), 3);
  const contrib: [string, string, number][] = [
    ['Repair cost ratio', `${pct0(r)} of new`, clip((r - maxRatio) * 2.2)],
    ['Failures last 12 m', String(f.failures_last_12m), clip((f.failures_last_12m - 2.2) / 1.6)],
    ['Asset age', `${fixed(f.asset_age_years, 1)} y`, clip((f.asset_age_years - oldAge) / 5) * (r > oldRatio ? 1.0 : 0.35)],
    ['Spare / standby ready', f.spare_ready ? 'Yes' : 'No', f.spare_ready ? -0.18 : 0.22],
    ['Downtime loss exposure', `PHP ${fmtComma(f.downtime_loss_php, 0)}`, clip(f.downtime_loss_php / 2.0e7, 0, 0.4)],
  ];
  const factors = sortBy(contrib.map(([n, v, w]) => ({ feature: n, value: v, weight: pyRound(w, 3) })), x => Math.abs(x.weight), true);
  const rate = Math.max(f.failures_last_12m, 0.5);
  const avgFail = f.avg_failure_cost_php ? f.avg_failure_cost_php : Math.max(f.repair_cost_php * 0.5, 1);
  const repair3y = f.repair_cost_php + HORIZON_Y * rate * avgFail;
  const replace3y = f.new_unit_cost_php + HORIZON_Y * NEW_UNIT_FAILURES_PER_YEAR * avgFail;
  const cheaper = replace3y < repair3y ? 'Replace' : 'Repair';
  const follow = replace ? 'Replace' : 'Repair';
  const savings = follow === 'Replace' ? repair3y - replace3y : replace3y - repair3y;
  return {
    recommendation: decision, replace, confidence, rules, factors,
    costs: {
      repair_now_php: pyRound(f.repair_cost_php), replace_now_php: pyRound(f.new_unit_cost_php),
      repair_cost_ratio: pyRound(r, 3), repair_3y_php: pyRound(repair3y), replace_3y_php: pyRound(replace3y),
      cheaper_over_3y: cheaper, savings_3y_php: pyRound(savings),
      savings_note: savings >= 0 ? `Following the recommendation saves ≈ PHP ${fmtComma(savings, 0)} over 3 years (direct maintenance cost)`
        : `3-year direct cost favours ${cheaper} by PHP ${fmtComma(-savings, 0)}; plant decision rules still govern – review at MG-01`,
      assumptions: [
        `Repair path: current failure rate (${fmtG(rate)}/yr) continues; avg failure cost PHP ${fmtComma(avgFail, 0)}`,
        `Replace path: new unit fails ${NEW_UNIT_FAILURES_PER_YEAR}/yr (ASSUMED)`,
        'Direct maintenance cost only; downtime exposure shown separately',
      ],
    },
    downtime: {
      loss_per_failure_php: pyRound(f.downtime_loss_php),
      note: f.downtime_loss_php === 0 ? 'Standby or spare covers the outage – no production loss expected'
        : `This event cost PHP ${fmtComma(f.downtime_loss_php, 0)} in lost production (pair down, Loss_Scenarios) – repeat failures without a ready standby risk plant curtailment`,
    },
    model: MODEL_INFO,
  };
}

export function predict(f: Features): any {
  const out: any = rulePredict(f);
  out.features = { ...f, repair_cost_ratio: pyRound(ratioOf(f), 3) };
  return out;
}

function spareReady(aid: string, spare: string | null): boolean {
  const sp = spare || SPARE_FOR[aid];
  const s = D.spareSummary[sp || ''];
  return !!(s && s.readiness_status === 'Ready');
}

function featuresForCase(c: any): Features {
  const fs = D.failures.filter(x => x.asset_id === c.asset_id && truthy(num(x.repair_cost_php)));
  let sum = 0; for (const x of fs) sum += num(x.repair_cost_php, 0);
  return {
    asset_id: c.asset_id, repair_cost_php: num(c.repair_cost_php, 0), new_unit_cost_php: num(c.new_unit_cost_php, 0),
    asset_age_years: num(c.asset_age_years, 0), failures_last_12m: Math.trunc(num(c.failures_last_12m, 0)),
    spare_ready: truthy(c.ready_spare), downtime_loss_php: num(c.downtime_loss_php, 0), avg_failure_cost_php: fs.length ? sum / fs.length : null,
  };
}

export function cases(): any[] {
  return D.repairCases.map(c => {
    const fe = D.failures.find(f => f.event_id === c.failure_event_id) || {};
    const p = predict(featuresForCase(c));
    return { case: c, failure_mode: fe.failure_mode ?? null, prediction: p,
      agrees_with_record: p.recommendation.split(' (')[0] === pyStr(c.recommended_decision).split(' (')[0] };
  });
}

export function liveFeatures(aid: string, repairCostPhp: number | null = null, downtimeLossPhp = 0.0): Features {
  const a = D.asset[aid] || {};
  const inst = parseDt(a.install_date);
  const now = parseDt(CLOCK.asOf)!;
  const age = inst !== null && now !== null ? Math.floor((now - inst) / DAY) / 365.25 : 0.0;
  const fs = failuresFor(aid);
  const last12 = fs.filter(f => { const t = parseDt(f.failure_at); return t !== null && t >= now - 365 * DAY; });
  const costs = fs.filter(f => truthy(num(f.repair_cost_php))).map(f => num(f.repair_cost_php, 0));
  if (repairCostPhp === null || repairCostPhp === undefined) repairCostPhp = costs.length ? costs[0] : 0.0;
  let sum = 0; for (const c of costs) sum += c;
  return {
    asset_id: aid, repair_cost_php: Number(repairCostPhp), new_unit_cost_php: newUnitCost(aid), asset_age_years: pyRound(age, 1),
    failures_last_12m: last12.length, spare_ready: spareReady(aid, null), downtime_loss_php: downtimeLossPhp,
    avg_failure_cost_php: costs.length ? sum / costs.length : null,
  };
}

// --------------------------------------------------------------------------- replacement options (brands + suppliers)
/** Supplier types that can supply a new unit of each asset type (Suppliers.supplier_type) – fallback for assets with no
 *  class in ref/data_patches/replacement_brands.json. */
const ALT_TYPES: Record<string, RegExp> = {
  pump: /^pumps/i, 'spare pump': /^pumps/i, motor: /electrical|motor repair|local service/i, 'spare motor': /electrical|motor repair|local service/i,
  'vibrator motor': /electrical|motor repair|local service/i, screen: /^screens/i,
};
const SEE = /see website|online|to confirm/i;
const sourceOf = (id: string | null | undefined) => {
  const k = String(id ?? '').split(/;\s*/)[0];
  const s = D.replacementBrands.sources?.[k];
  return s ? { id: k, description: s.description, link: s.link ?? null } : (k ? { id: k, description: null, link: null } : null);
};
const supplierRow = (id: string): any => D.suppliers[id] ?? (D.replacementBrands.extra_suppliers ?? []).find((x: any) => x.supplier_id === id) ?? null;
const supplierOut = (s: any, why: string) => {
  const src = sourceOf(s.source_id);
  return {
    supplier_id: s.supplier_id, supplier_name: s.supplier_name, supplier_type: s.supplier_type, supplies: s.supplies, location: s.location,
    phone: s.phone, email: s.email, lead_time_days: s.typical_lead_time_days ?? null, basis: s.basis, why,
    source_id: s.source_id ?? null, website: src?.link ?? null,
    contact: [s.phone, s.email].filter((v: any) => v && !SEE.test(String(v))).join(' · ') || null,
  };
};
const php = (n: number) => `PHP ${fmtComma(n, 0)}`;

/** Cost of one new unit for an option: the brand's own Cost_Reference item, or the same-duty item as a budget. */
function optionCost(c: any, model: string | null) {
  if (!c) return null;
  const id = c.cost_id ?? c.budget_cost_id;
  const cr = id ? D.costRef[id] : null;
  if (!cr) return null;
  const qty = /×\s*2(?!\d)/.test(String(model ?? '')) ? 2 : 1;
  const value = num(cr.value, 0) * qty;
  const budget = !c.cost_id;
  return {
    php: value, cost_id: id, item: `${qty > 1 ? `${qty} × ` : ''}${cr.item}`, basis: cr.basis, source_id: cr.source_id, budget,
    note: budget ? `Budget only – no brand price in the data; same-duty ${cr.item} (${id}). Get a quote.` : (c.note ?? null),
  };
}

/** Repair / Replace → "Replacement options": the installed brand/model, the like-for-like and alternative brands with their
 *  suppliers (lead time, contact, indicative new-unit cost, source), repair services, and the parts that fit the unit.
 *  Brands/suppliers per asset class: ref/data_patches/replacement_brands.json (mined from the data + guide workbooks);
 *  supplier details: Suppliers sheet; costs: Cost_Reference. */
export function replacementOptions(assetId: string) {
  const a = D.asset[assetId];
  if (!a) return null;
  const brand = String(a.manufacturer ?? '').trim();
  const generic = !brand || /^generic/i.test(brand);
  const parts = D.spares.filter((p: any) => String(p.fits_assets ?? '').split(/;\s*/).includes(assetId)).map((p: any) => ({
    part_id: p.part_id, part_name: p.part_name, part_number: p.part_number, category: p.category, qty_on_hand: p.qty_on_hand, min_qty: p.min_qty,
    unit: p.unit, unit_cost_php: p.unit_cost_php, lead_time_days: p.lead_time_days, storage_location: p.storage_location, critical: !!p.critical,
    supplier: D.suppliers[p.supplier_id]?.supplier_name ?? null, supplier_id: p.supplier_id ?? null,
  }));
  const duty = [a.rated_flow_m3h && `${a.rated_flow_m3h} m³/h`, a.rated_head_m && `${a.rated_head_m} m head`, a.rated_power_kw && `${a.rated_power_kw} kW`,
    a.voltage_v && `${a.voltage_v} V`, a.speed_rpm && `${a.speed_rpm} rpm`].filter(Boolean).join(', ');
  const cls = (D.replacementBrands.classes ?? []).find((c: any) => (c.assets ?? []).includes(assetId));
  const own = cls?.options?.find((o: any) => o.cost?.cost_id);
  const installedCost = a.purchase_cost_php ?? null;
  const installed = {
    brand: brand || null, model: a.model ?? null, rated_flow_m3h: a.rated_flow_m3h ?? null, rated_head_m: a.rated_head_m ?? null,
    rated_power_kw: a.rated_power_kw ?? null, speed_rpm: a.speed_rpm ?? null, duty: duty || null,
    new_unit_cost_php: installedCost, cost_basis: installedCost != null ? `Equipment_Register.purchase_cost_php (${a.basis ?? '—'})` : null,
    basis: a.basis ?? null, sources: String(a.source_id ?? '').split(/;\s*/).filter(Boolean).map(sourceOf),
  };

  let options: any[];
  let services: any[] = [];
  if (cls) {
    options = cls.options.map((o: any) => {
      const cost = optionCost(o.cost, o.kind.startsWith('Installed') ? a.model : o.model);
      return {
        kind: o.kind, brand: o.brand, model: o.model, why: o.why ?? null, found_in: o.found_in ?? [],
        sources: (o.sources ?? []).map(sourceOf).filter(Boolean),
        new_unit_cost_php: cost?.php ?? null, cost,
        suppliers: (o.suppliers ?? []).map(supplierRow).filter(Boolean).map((s: any) => supplierOut(s, o.brand ? `${o.brand} channel` : String(s.supplier_type))),
      };
    });
    services = (cls.services ?? []).map((sv: any) => {
      const cr = sv.cost_id ? D.costRef[sv.cost_id] : null;
      return { kind: sv.kind, note: sv.note ?? null, cost_php: cr ? num(cr.value, 0) : null, cost_item: cr?.item ?? null, cost_basis: cr?.basis ?? null,
        suppliers: (sv.suppliers ?? []).map(supplierRow).filter(Boolean).map((s: any) => supplierOut(s, sv.kind)) };
    });
    if (installed.new_unit_cost_php == null && options[0]?.cost) {
      installed.new_unit_cost_php = options[0].cost.php;
      installed.cost_basis = `Indicative – ${options[0].cost.item} (${options[0].cost.cost_id}); no register price for this placeholder`;
    } else if (own) {
      const c = optionCost(own.cost, a.model);
      if (c) installed.cost_basis = `${c.item} (${c.cost_id}, ${c.basis})`;
    }
  } else {
    const sups = Object.values(D.suppliers) as any[];
    const oem = generic ? [] : sups.filter(s => `${s.supplier_name} ${s.supplies}`.toLowerCase().includes(brand.toLowerCase().split(' ')[0]));
    const re = ALT_TYPES[String(a.asset_type ?? '').toLowerCase()];
    const alt = re ? sups.filter(s => re.test(String(s.supplier_type ?? '')) && !oem.includes(s)) : [];
    const brandOf = (s: any) => { const m = /^(Grundfos|Ebara|KSB|Tsurumi)/i.exec(s.supplier_name); return m ? m[1] : null; };
    options = [
      ...(!generic ? [{ kind: 'Installed brand (like-for-like)', brand, model: a.model ?? null, new_unit_cost_php: installedCost, cost: null, sources: [], found_in: ['Equipment_Register'], why: null,
        suppliers: oem.map(s => supplierOut(s, `${brand} channel`)) }] : []),
      ...alt.map(s => ({ kind: generic ? 'Equivalent unit' : 'Alternative brand', brand: brandOf(s) ?? (generic ? brand || null : null),
        model: `Match duty: ${duty || a.model || 'same rating'}`, new_unit_cost_php: null, cost: null, sources: [sourceOf(s.source_id)].filter(Boolean), found_in: ['Suppliers'], why: null,
        suppliers: [supplierOut(s, String(s.supplier_type))] })),
    ];
  }

  // The pick for a "Replace" decision: like-for-like (first option with a supplier), best-documented supplier first;
  // plus the fastest other channel when it is quicker.
  const lead = (s: any) => (s.lead_time_days == null ? 1e9 : s.lead_time_days);
  const pickOpt = options.find(o => o.suppliers.length);
  const pickSup = pickOpt ? [...pickOpt.suppliers].sort((x: any, y: any) => (x.basis === 'Sourced' ? 0 : 1) - (y.basis === 'Sourced' ? 0 : 1) || lead(x) - lead(y))[0] : null;
  const summary = (o: any, s: any) => ({
    kind: o.kind, brand: o.brand, model: o.model, supplier_id: s.supplier_id, supplier_name: s.supplier_name, location: s.location,
    lead_time_days: s.lead_time_days, contact: s.contact, website: s.website, supplier_basis: s.basis,
    new_unit_cost_php: o.new_unit_cost_php, cost_budget: !!o.cost?.budget,
    text: `${o.brand ?? 'Equivalent unit'}${o.model ? ` ${o.model}` : ''} from ${s.supplier_name}`
      + `${s.lead_time_days != null ? ` · ~${s.lead_time_days} d` : ''}${o.new_unit_cost_php ? ` · ${o.cost?.budget ? 'budget ' : ''}${php(o.new_unit_cost_php)}` : ''}`
      + `${/to confirm/i.test(`${s.supplier_name} ${s.basis}`) || s.basis === 'Assumed' ? ' (supplier to confirm)' : ''}`,
  });
  const recommended = pickOpt && pickSup ? summary(pickOpt, pickSup) : null;
  let fastest: any = null;
  for (const o of options) for (const s of o.suppliers)
    if (s.lead_time_days != null && (!fastest || s.lead_time_days < fastest.s.lead_time_days)) fastest = { o, s };
  const quicker = fastest && recommended && fastest.s.supplier_id !== recommended.supplier_id
    && fastest.s.lead_time_days < (recommended.lead_time_days ?? 1e9) ? summary(fastest.o, fastest.s) : null;

  return {
    asset_id: assetId, asset_type: a.asset_type, class_label: cls?.label ?? null, placeholder: !!cls?.placeholder || /placeholder/i.test(String(a.basis ?? '')),
    installed, options, recommended, fastest_alternative: quicker, services, no_alternative_note: cls?.no_alternative_note ?? null,
    parts,
    note: 'Brands and suppliers from the data package (Equipment_Register, Suppliers, Cost_Reference, Spare_Parts_Inventory) and the guide’s Sources sheet. '
      + 'Contacts marked "(see website)" or "to confirm" need checking before ordering; alternative-brand costs are budgets until quoted.',
  };
}

/** One-line "replace with" for the RR decision and the Caster tool. */
export function replaceWith(assetId: string) {
  const r = replacementOptions(assetId);
  if (!r?.recommended) return null;
  return { text: r.recommended.text, fastest_alternative: r.fastest_alternative?.text ?? null,
    brand: r.recommended.brand, supplier: r.recommended.supplier_name, lead_time_days: r.recommended.lead_time_days, new_unit_cost_php: r.recommended.new_unit_cost_php };
}

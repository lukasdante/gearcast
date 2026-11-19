/** Typed access to the extracted prototype data (plant.json / ops.json). */
import plantRaw from './plant.json';
import opsRaw from './ops.json';

export interface Equipment {
  asset_id: string; asset_type: string; description: string; location_node: string | null;
  pair_id: string | null; default_role: string | null; manufacturer: string | null; model: string | null;
  rated_flow_m3h: string | null; rated_head_m: string | null; rated_power_kw: string | null;
  speed_rpm: string | null; serial_no: string | null; install_date: string | null;
  expected_life_years: string | null; parent_asset: string | null; criticality: string | null;
}
export interface EquipmentStatusRow {
  asset_id: string; current_status: string; status_since: string; last_history_id: string | null;
  process_node: string | null; physical_location: string | null; status_source: string | null;
}
export interface StatusCode { status_code: string; status: string; colour_hex: string; meaning: string }
export interface DutyRotationRow { date: string; pair_id: string; duty_asset: string; standby_asset: string }
export interface LayoutEl {
  element_id: string; element_type: string; ref_id: string | null; x: string | null; y: string | null;
  width: string | null; height: string | null; symbol: string; label: string; path_points: string | null;
}
export interface PlantNode { node_id: string; node_name: string; area: string; equipment_tags: string | null }
export interface Link { link_id: string; from_node: string; to_node: string; flow_type: string; avg_m3h: number | string | null }
export interface PlantParam { parameter: string; value: number | null; value_text: string | null; unit: string }
export interface StatusHistoryRow {
  history_id: string; asset_id: string; previous_status: string | null; new_status: string;
  effective_at: string; ended_at: string | null; reason: string | null; source_type: string | null;
  source_id: string | null; incident_report_id: string | null; recorded_by: string | null;
  authorized_by: string | null; data_mode?: string | null;
}
export interface Failure {
  event_id: string; asset_id: string; failure_at: string; symptom: string | null; failure_mode: string | null;
  root_cause?: string | null; repair_action?: string | null; detected_by?: string | null; lesson_learned?: string | null;
  downtime_h: string | null; main_wo_id: string | null;
}
export interface WorkOrder {
  wo_id: string; asset_id: string; wo_type: string; priority: string; title: string;
  reported_at: string; status: string; duration_h: number | null;
}
export interface PmStatus {
  status_id: string; task_id: string; task: string; asset_id: string; interval_days: number | null;
  last_done_date: string | null; next_due_date: string | null; days_until_due: number | null; status: string;
}
export interface SpareSummary {
  asset_id: string; spare_type: string; location: string; last_check_date: string | null;
  readiness_status: string; next_check_due: string | null; overdue: string; remarks: string | null;
}
export interface ProcedureFigure { figure_id: string; file_name: string; title: string; figure_type: string; caption: string | null }
export interface DailyCheck {
  date: string; asset_id: string; running: boolean; vib_de_mm_s: number | null; vib_nde_mm_s: number | null;
  temp_de_c: number | null; temp_nde_c: number | null; seal_reservoir_level_pct?: number | null; remarks?: string | null;
}
export interface ManualRound {
  date: string; time: string; asset_id: string; role: string | null; status: string | null;
  flow_m3h: number | null; discharge_pressure_bar: number | null; current_a: number | null; remarks: string | null;
}
export interface PmTask { task_id: string; task: string; assets: string; interval_days: number | null; procedure_ids: string | null; est_time_h: number | null; role: string | null; stop_needed: string | null }
export interface Procedure {
  procedure_id: string; title: string; category: string; equipment: string | null; purpose: string | null; when_used: string | null;
  skills: string | null; crew_size: number | null; tools: string | null; ppe: string | null; permits: string | null;
  est_time_h: number | null; parts: string | null; prerequisites: string | null; step_count: number | null; revision: string | null;
}
export interface SparePart {
  part_id: string; part_name: string; fits_assets: string; category: string; part_number: string | null; unit: string;
  qty_on_hand: number; min_qty: number; max_qty: number | null; reorder_point: number | null; lead_time_days: number | null;
  unit_cost_php: number | null; critical: boolean; storage_location: string | null; below_min: boolean;
}
export interface IncidentReport {
  report_id: string; asset_id: string; incident_date: string; severity: string | null; failure_mode: string | null;
  root_cause: string | null; corrective_action: string | null; status: string | null;
}

export interface PlantData {
  dataAsOf: string;
  plantParameters: PlantParam[];
  layout: LayoutEl[];
  nodes: PlantNode[];
  links: Link[];
  equipment: Equipment[];
  equipmentStatus: EquipmentStatusRow[];
  statusCodes: StatusCode[];
  dutyRotation: DutyRotationRow[];
  lossScenarios: { scenario_id: string; title: string; asset_group: string; standby_ready: boolean; outage_h: number; response: string | null; total_loss_php: number | null }[];
}
export interface OpsData {
  failures: Failure[];
  statusHistory: StatusHistoryRow[];
  workOrders: WorkOrder[];
  pmStatus: PmStatus[];
  spareSummary: SpareSummary[];
  procedureFigures: ProcedureFigure[];
  procedureKeyPoints: { procedure_id: string; point_order: number; point_type: string; text: string }[];
  procedureSelfCheck: { procedure_id: string; question_order: number; question: string; answer: string }[];
  procedureSteps: { procedure_id: string; step_no: number; phase: string; instruction: string; acceptance_criteria: string | null; safety_note: string | null }[];
  dailyChecks: DailyCheck[];
  manualRounds: ManualRound[];
  pmTasks: PmTask[];
  procedures: Procedure[];
  spareInventory: SparePart[];
  incidentReports: IncidentReport[];
}

// ---------------------------------------------------------------- "today" simulation
/**
 * The bundled data was cut off on DATA_CUTOFF. Every date / datetime string is shifted by OFFSET_DAYS at load so
 * the plant reads as if it is happening today (same rule as backend/src/gearcast_backend/data.py). Relative values
 * (days until due, overdue, "since") stay correct because the dataset's own as-of dates shift by the same amount.
 */
const DATA_CUTOFF = '2026-10-31';
const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayIndex = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;

/** Today's local date, YYYY-MM-DD: the "now" every cut-off and relative date uses. */
export const NOW_DATE = isoDate(new Date());
export const OFFSET_DAYS = dayIndex(NOW_DATE) - dayIndex(DATA_CUTOFF);

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})((?:[ T]\d{2}:\d{2}(?::\d{2})?)?.*)$/;
export function shiftDateStr(v: string, days = OFFSET_DAYS): string {
  if (v.length > 25) return v.replace(/(?<![\w-])20\d\d-\d\d-\d\d(?![\w-])/g, x => shiftDateStr(x, days)); // dates inside free text
  const m = v.match(DATE_RE);
  if (!m) return v;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + days));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}${m[4]}`;
}
function shiftDates<T>(o: T, days = OFFSET_DAYS): T {
  if (!days) return o;
  if (Array.isArray(o)) return o.map(v => shiftDates(v, days)) as T;
  if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shiftDates(v, days)])) as T;
  if (typeof o === 'string') return shiftDateStr(o, days) as T;
  return o;
}

export const PLANT = shiftDates(plantRaw as PlantData);
export const OPS = shiftDates(opsRaw as OpsData);

export const assetById = new Map(PLANT.equipment.map(a => [a.asset_id, a]));
export const nodeById = new Map(PLANT.nodes.map(n => [n.node_id, n]));
export const plantName =
  PLANT.plantParameters.find(p => p.parameter === 'Plant modelled')?.value_text ?? 'Wastewater treatment plant';

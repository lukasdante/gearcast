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
  temp_de_c: number | null; temp_nde_c: number | null;
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
}
export interface OpsData {
  failures: Failure[];
  statusHistory: StatusHistoryRow[];
  workOrders: WorkOrder[];
  pmStatus: PmStatus[];
  spareSummary: SpareSummary[];
  procedureFigures: ProcedureFigure[];
  dailyChecks: DailyCheck[];
}

export const PLANT = plantRaw as PlantData;
export const OPS = opsRaw as OpsData;

/** "Now" for this dataset. */
export const AS_OF_DATE = '2026-10-31';
export const AS_OF_LABEL = '31 Oct 2026';

export const assetById = new Map(PLANT.equipment.map(a => [a.asset_id, a]));
export const nodeById = new Map(PLANT.nodes.map(n => [n.node_id, n]));
export const plantName =
  PLANT.plantParameters.find(p => p.parameter === 'Plant modelled')?.value_text ?? 'Wastewater treatment plant';

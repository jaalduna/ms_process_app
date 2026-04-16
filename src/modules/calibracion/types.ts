import type { JobStatus } from "@/types/api"

/** Calibration pipeline step names (ordered). */
export type CalibrationStepName =
  | "sync_data"
  | "copy_to_calibration"
  | "merge_data"
  | "simulate_kpis"
  | "calculate_penetration"
  | "download_csv"

/** Human-readable labels for each calibration step. */
export const CALIBRATION_STEP_LABELS: Record<CalibrationStepName, string> = {
  sync_data: "Sync Data",
  copy_to_calibration: "Copy to Calibration",
  merge_data: "Merge Data",
  simulate_kpis: "Simulate KPIs",
  calculate_penetration: "Calculate Penetration",
  download_csv: "Download CSV",
}

/** Ordered list of calibration steps for iteration. */
export const CALIBRATION_STEPS: CalibrationStepName[] = [
  "sync_data",
  "copy_to_calibration",
  "merge_data",
  "simulate_kpis",
  "calculate_penetration",
  "download_csv",
]

/** Status of a single Databricks task within a multi-task job run. */
export interface DatabricksTaskStatus {
  task_key: string
  status: JobStatus
  started_at: string | null
  completed_at: string | null
  error: string | null
}

/** Status of a single calibration sub-step. */
export interface CalibrationStep {
  name: CalibrationStepName
  status: JobStatus
  started_at: string | null
  completed_at: string | null
  error: string | null
  tasks?: DatabricksTaskStatus[]
}

/** Aggregation level options for calibration */
export interface AggregationOptions {
  region: boolean
  nivel_2: boolean
}

/** Global calibration configuration applied to all countries */
export interface CalibrationConfig {
  aggregations: AggregationOptions
  row_limit: number | null
  lookback_months: number | null
  group_by: string
  start_period: string
  skip_merge: boolean
  skip_simulation: boolean
}

export const DEFAULT_CALIBRATION_CONFIG: CalibrationConfig = {
  aggregations: { region: false, nivel_2: false },
  row_limit: null,
  lookback_months: null,
  group_by: "",
  start_period: "202102",
  skip_merge: false,
  skip_simulation: false,
}

/** Default group_by per country (semicolon-separated dimension combos). */
export const DEFAULT_GROUP_BY: Record<string, string> = {
  bolivia:  "IdProduto_Calib;IdProduto_Calib,Region",
  cam:      "IdProduto_Calib,Pais",
  chile:    "IdProduto_Calib;IdProduto_Calib,Region",
  colombia: "IdProduto_Calib;IdProduto_Calib,Region",
  ecuador:  "IdProduto_Calib,Region_A;IdProduto_Calib,Region_A,Nivel_2",
  mexico:   "IdProduto_Calib;IdProduto_Calib,Region",
  peru:     "IdProduto_Calib;IdProduto_Calib,Region",
}

/** Data availability for a country+period */
export interface DataAvailability {
  elegibilidad: boolean
  pesaje: boolean
}

/** Response from GET /metadata/data-availability */
export interface DataAvailabilityResponse {
  period: string
  countries: Record<string, DataAvailability>
}

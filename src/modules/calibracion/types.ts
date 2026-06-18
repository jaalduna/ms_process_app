import type { JobStatus } from "@/types/api"

/** Calibration pipeline step names (ordered).
 *
 * SQL→Databricks sync is owned outside this app — calibration assumes data is
 * already landed in Unity Catalog `000` before triggering. The first step
 * `copy_to_calibration` promotes data from catalog `000` to catalog `001`
 * (calibration-ready) and must succeed before any calculation step runs. */
export type CalibrationStepName =
  | "copy_to_calibration"
  | "merge_data"
  | "simulate_kpis"
  | "calculate_penetration"
  | "download_csv"

/** Known human-readable labels for calibration step names. This is only a
 * presentation niceity — the actual steps (names + order) are driven entirely
 * by the backend (the Databricks job's task list). Names not listed here fall
 * back to `prettifyStepName`. */
export const CALIBRATION_STEP_LABELS: Record<string, string> = {
  copy_to_calibration: "Copy to Calibration Catalog",
  merge_data: "Merge Data",
  simulate_kpis: "Simulate KPIs",
  calculate_penetration: "Calculate Penetration",
  download_csv: "Download CSV",
}

/** Fallback label for backend step names not in CALIBRATION_STEP_LABELS:
 * "calculate_penetration" -> "Calculate Penetration". */
export function prettifyStepName(name: string): string {
  return name
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

/** Resolve a display label for a backend step name (known label or prettified). */
export function stepLabel(name: string): string {
  return CALIBRATION_STEP_LABELS[name] ?? prettifyStepName(name)
}

/** Known calibration step names in canonical order. Kept for reference only —
 * rendering iterates the backend-provided steps, NOT this list. */
export const CALIBRATION_STEPS: CalibrationStepName[] = [
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

/** Status of a single calibration sub-step. The `name` is backend-driven
 * (the Databricks task key); not constrained to a fixed set. */
export interface CalibrationStep {
  name: string
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
  lookback_months: number
}

export const DEFAULT_CALIBRATION_CONFIG: CalibrationConfig = {
  aggregations: { region: true, nivel_2: true },
  lookback_months: 36,
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

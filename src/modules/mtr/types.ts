export type MtrStepName =
  | "generate_targets"
  | "compute_imputations"
  | "validate_results"
  | "export_results"
  | "complete"

/** Human-readable labels for each MTR step. */
export const MTR_STEP_LABELS: Record<MtrStepName, string> = {
  generate_targets: "Generate Targets",
  compute_imputations: "Compute Imputations",
  validate_results: "Validate Results",
  export_results: "Export Results",
  complete: "Complete",
}

/** Ordered list of MTR steps for iteration. */
export const MTR_STEPS: MtrStepName[] = [
  "generate_targets",
  "compute_imputations",
  "validate_results",
  "export_results",
  "complete",
]

export type MtrStatus = "pending" | "running" | "completed" | "failed" | "cancelled"

/** Statuses where the pipeline is actively processing (excludes "pending" which is pre-execution). */
export const MTR_ACTIVE_STATUSES: MtrStatus[] = ["running"]

/** Statuses that should trigger polling (includes "pending" since it transitions to "running" after execute). */
export const MTR_POLL_STATUSES: MtrStatus[] = ["pending", "running"]

export const MTR_STATUS_CONFIG: Record<
  MtrStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }
> = {
  pending: { label: "Pendiente", variant: "outline", className: "" },
  running: { label: "Ejecutando...", variant: "default", className: "bg-blue-500 hover:bg-blue-500/80" },
  completed: { label: "Completado", variant: "default", className: "bg-green-600 hover:bg-green-600/80" },
  failed: { label: "Error", variant: "destructive", className: "" },
  cancelled: { label: "Cancelado", variant: "secondary", className: "" },
}

/** Status of a single MTR pipeline step. */
export interface MtrStep {
  name: MtrStepName
  status: string
  started_at?: string | null
  completed_at?: string | null
  error?: string | null
}

/** Summary of MTR imputation results. */
export interface MtrResultsSummary {
  total_targets: number
  targets_achieved: number
  total_imputations: number
  quality_score?: number
}

/** A single MTR run. */
export interface MtrRun {
  run_id: string
  country: string
  period: number
  status: MtrStatus
  parameters_json?: Record<string, unknown>
  results_summary?: MtrResultsSummary | null
  steps?: MtrStep[]
  current_step?: string
  started_at?: string
  completed_at?: string
  created_by?: string
  created_at: string
  updated_at: string
  error_message?: string
}

/** Request body for creating a new MTR run. */
export interface MtrRunCreate {
  country: string
  period: number
  parameters?: Record<string, unknown>
}

/** Placeholder MTR parameters -- concrete fields TBD when backend is defined. */
export interface MtrParams {
  target_threshold: number
  imputation_method: string
  quality_min: number
}

export const DEFAULT_MTR_PARAMS: MtrParams = {
  target_threshold: 0.85,
  imputation_method: "weighted_average",
  quality_min: 0.80,
}

export const MTR_PARAM_META: Record<
  keyof MtrParams,
  { label: string; unit: string; step?: string; type?: "number" | "select"; options?: string[] }
> = {
  target_threshold: { label: "Target achievement threshold", unit: "ratio", step: "0.01" },
  imputation_method: {
    label: "Imputation method",
    unit: "",
    type: "select",
    options: ["weighted_average", "nearest_neighbor", "regression"],
  },
  quality_min: { label: "Minimum quality score", unit: "ratio", step: "0.01" },
}

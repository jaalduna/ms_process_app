export type QmsTrStatus = "pending" | "running" | "completed" | "failed" | "cancelled"

/** Statuses where the pipeline is actively processing (excludes "pending" which is pre-execution). */
export const QMSTR_ACTIVE_STATUSES: QmsTrStatus[] = ["running"]

/** Statuses that should trigger polling (includes "pending" since it transitions to "running"). */
export const QMSTR_POLL_STATUSES: QmsTrStatus[] = ["pending", "running"]

export const QMSTR_STATUS_CONFIG: Record<
  QmsTrStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }
> = {
  pending: { label: "Pendiente", variant: "outline", className: "" },
  running: { label: "Ejecutando...", variant: "default", className: "bg-blue-500 hover:bg-blue-500/80" },
  completed: { label: "Completado", variant: "default", className: "bg-green-600 hover:bg-green-600/80" },
  failed: { label: "Error", variant: "destructive", className: "" },
  cancelled: { label: "Cancelado", variant: "secondary", className: "" },
}

/** Status of a single QMS-TR pipeline step. `name` is a free-form value
 * returned by the engine -- there is no fixed 4-step enum (that was an MTR
 * assumption that does not hold for the real qms_tr engine). */
export interface QmsTrStep {
  name: string
  status: string
  started_at?: string | null
  completed_at?: string | null
  error?: string | null
}

/** A single QMS-TR job. Keyed by `job_id` (not `run_id`/DB-record like MTR) --
 * same job_id/steps/tag model as calibración/sync. */
export interface QmsTrRun {
  job_id: string
  country: string
  ano_base: number
  status: QmsTrStatus
  steps: QmsTrStep[]
  /** Set once the job produces a downloadable result; feeds GET /qms_tr/{tag}/download. */
  tag?: string | null
  started_at?: string | null
  completed_at?: string | null
  created_at: string
  updated_at: string
  error_message?: string | null
}

/** Request body for creating (and starting) a new QMS-TR job. */
export interface QmsTrRunCreate {
  country: string
  ano_base: number
  parameters?: Record<string, unknown>
}

/** Placeholder QMS-TR parameters -- concrete fields TBD when the backend config
 * (JAA-990) is defined. Kept separate from MTR's params so the two can diverge. */
export interface QmsTrParams {
  target_threshold: number
  imputation_method: string
  quality_min: number
}

export const DEFAULT_QMSTR_PARAMS: QmsTrParams = {
  target_threshold: 0.85,
  imputation_method: "weighted_average",
  quality_min: 0.80,
}

export const QMSTR_PARAM_META: Record<
  keyof QmsTrParams,
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

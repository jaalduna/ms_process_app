/** Price validation pipeline step names (ordered). */
export type PricesStepName = "load_data" | "detect_outliers" | "generate_report" | "complete"

/** Human-readable labels for each price validation step. */
export const PRICES_STEP_LABELS: Record<PricesStepName, string> = {
  load_data: "Cargar Datos",
  detect_outliers: "Detectar Outliers",
  generate_report: "Generar Reporte",
  complete: "Completo",
}

/** Ordered list of price validation steps for iteration. */
export const PRICES_STEPS: PricesStepName[] = [
  "load_data",
  "detect_outliers",
  "generate_report",
  "complete",
]

/** Status of a single price validation step. */
export interface PricesStep {
  name: PricesStepName
  status: "pending" | "running" | "completed" | "failed"
  started_at: string | null
  completed_at: string | null
  error: string | null
}

export type PricesStatus = "pending" | "running" | "results_ready" | "approved" | "failed" | "cancelled"

/** Statuses indicating the pipeline is actively processing. */
export const ACTIVE_PRICES_STATUSES: PricesStatus[] = ["running"]

export const PRICES_STATUS_CONFIG: Record<
  PricesStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }
> = {
  pending: { label: "Pendiente", variant: "outline", className: "" },
  running: { label: "Ejecutando...", variant: "default", className: "bg-blue-500 hover:bg-blue-500/80" },
  results_ready: { label: "Resultados listos", variant: "default", className: "bg-amber-500 hover:bg-amber-500/80" },
  approved: { label: "Aprobado", variant: "default", className: "bg-green-600 hover:bg-green-600/80" },
  failed: { label: "Error", variant: "destructive", className: "" },
  cancelled: { label: "Cancelado", variant: "secondary", className: "" },
}

/** A single flagged price outlier. */
export interface PricesOutlier {
  product: string
  declared_price: number
  historical_avg: number
  deviation_pct: number
  reason: string
  household_id: string
}

export interface PricesRun {
  run_id: string
  country: string
  period: number
  status: PricesStatus
  parameters_json?: Record<string, unknown>
  outliers?: PricesOutlier[]
  outliers_count?: number
  steps?: PricesStep[]
  current_step?: string
  started_at?: string
  completed_at?: string
  created_by?: string
  created_at: string
  updated_at: string
  approved_by?: string
  approved_at?: string
  error_message?: string
}

export interface PricesRunCreate {
  country: string
  period: number
  parameters?: Record<string, unknown>
}

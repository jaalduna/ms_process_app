export type WeightingStepName =
  | "load_eligible"
  | "calculate_weights"
  | "validate_distributions"
  | "export_results"
  | "complete"

export type WeightingStatus = "pending" | "running" | "completed" | "failed" | "cancelled"

export interface WeightingStep {
  name: WeightingStepName
  label: string
  status: string
  started_at?: string
  completed_at?: string
  error?: string | null
}

export interface WeightingSummary {
  total_households: number
  weighted_households: number
  min_weight: number
  max_weight: number
  mean_weight: number
  median_weight: number
  std_dev: number
}

export interface WeightingRun {
  run_id: string
  country: string
  period: number
  status: WeightingStatus
  parameters_json?: Record<string, unknown>
  summary_stats?: WeightingSummary | null
  steps?: WeightingStep[]
  current_step?: string | null
  started_at?: string
  completed_at?: string
  created_by?: string
  created_at: string
  updated_at: string
  error_message?: string | null
  /** JAA-755: exclusive per (country, period) — marks the run used for that scope */
  is_final?: boolean
  /** JAA-755: free-text note, e.g. "aprobada por X" */
  label?: string | null
}

export interface WeightingRunCreate {
  country: string
  period: number
  parameters?: Record<string, unknown>
}

export const WEIGHTING_STEP_ORDER: WeightingStepName[] = [
  "load_eligible",
  "calculate_weights",
  "validate_distributions",
  "export_results",
  "complete",
]

export const WEIGHTING_STEP_LABELS: Record<WeightingStepName, string> = {
  load_eligible: "Cargar Elegibles",
  calculate_weights: "Calcular Pesos",
  validate_distributions: "Validar Distribuciones",
  export_results: "Exportar Resultados",
  complete: "Listo",
}

export const WEIGHTING_ACTIVE_STATUSES: WeightingStatus[] = ["running"]

export const WEIGHTING_STATUS_CONFIG: Record<
  WeightingStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }
> = {
  pending: { label: "Pendiente", variant: "outline", className: "" },
  running: { label: "Ejecutando...", variant: "default", className: "bg-blue-500 hover:bg-blue-500/80" },
  completed: { label: "Completado", variant: "default", className: "bg-green-600 hover:bg-green-600/80" },
  failed: { label: "Error", variant: "destructive", className: "" },
  cancelled: { label: "Cancelado", variant: "secondary", className: "" },
}

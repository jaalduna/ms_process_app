// Formato 4 lifecycle types. Mirrors `src/modules/mtr/types.ts` (MTR-29) but
// uses the Databricks task_keys the formato4 pipeline emits. The mock-server
// (MTR-27) advances runs through exactly these steps, and
// monitor.map_run_to_steps() joins tasks→steps by name, so they MUST match the
// MTR-26 contract verbatim.
export type Formato4StepName =
  | "sync"
  | "merge"
  | "simulate"
  | "format_4"
  | "zip"

/** Human-readable labels for each formato4 step. */
export const FORMATO4_STEP_LABELS: Record<Formato4StepName, string> = {
  sync: "Sincronización",
  merge: "Merge",
  simulate: "Simulación",
  format_4: "Formato 4",
  zip: "Empaquetado",
}

/** Ordered list of formato4 steps for iteration. */
export const FORMATO4_STEPS: Formato4StepName[] = [
  "sync",
  "merge",
  "simulate",
  "format_4",
  "zip",
]

export type Formato4Status = "pending" | "running" | "completed" | "failed" | "cancelled"

/** Statuses where the pipeline is actively processing (excludes "pending" which is pre-execution). */
export const FORMATO4_ACTIVE_STATUSES: Formato4Status[] = ["running"]

/** Statuses that should trigger polling (includes "pending" since it transitions to "running" after execute). */
export const FORMATO4_POLL_STATUSES: Formato4Status[] = ["pending", "running"]

export const FORMATO4_STATUS_CONFIG: Record<
  Formato4Status,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }
> = {
  pending: { label: "Pendiente", variant: "outline", className: "" },
  running: { label: "Ejecutando...", variant: "default", className: "bg-blue-500 hover:bg-blue-500/80" },
  completed: { label: "Completado", variant: "default", className: "bg-green-600 hover:bg-green-600/80" },
  failed: { label: "Error", variant: "destructive", className: "" },
  cancelled: { label: "Cancelado", variant: "secondary", className: "" },
}

/** Status of a single formato4 pipeline step. */
export interface Formato4Step {
  name: Formato4StepName
  status: string
  started_at?: string | null
  completed_at?: string | null
  error?: string | null
}

/** Summary the formato4 writer emits (mirrors the mock `_metadata.json`). */
export interface Formato4ResultsSummary {
  country: string
  period: number
  row_count: number
  generated_at?: string
  sim_wheel_version?: string
}

/** A single formato4 run. */
export interface Formato4Run {
  run_id: string
  country: string
  period: number
  status: Formato4Status
  parameters_json?: Record<string, unknown>
  results_summary?: Formato4ResultsSummary | null
  steps?: Formato4Step[]
  current_step?: string
  started_at?: string
  completed_at?: string
  created_by?: string
  created_at: string
  updated_at: string
  error_message?: string
}

/** Request body for creating a new formato4 run. */
export interface Formato4RunCreate {
  country: string
  period: number
  parameters?: Record<string, unknown>
}

/**
 * Derive a 0-100 completion percentage from a run's steps. Mirrors the
 * progress math the MTR detail view uses, so the country grid / detail modal
 * (later tickets) can expose `percent` alongside status/steps/results/error.
 */
export function formato4Percent(run?: Pick<Formato4Run, "status" | "steps"> | null): number {
  if (!run) return 0
  if (run.status === "completed") return 100
  const steps = run.steps ?? []
  if (steps.length === 0) return 0
  const done = steps.filter((s) => s.status === "completed").length
  return Math.round((done / steps.length) * 100)
}

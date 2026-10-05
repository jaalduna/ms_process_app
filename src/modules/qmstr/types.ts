/**
 * QMS-TR (JAA-1401): contrato con ms-process-api `routes/qms_tr.py` (JAA-1400).
 *
 * El usuario elige país + instante; la API resuelve el snapshot de J siguiente a ese instante y
 * dispara el job `qms_tr_run` (repo mtr) con las versiones fijadas. Si el snapshot todavía no existe
 * la corrida queda en `waiting_snapshot` y parte sola cuando el CDC horario lo produce.
 */

export type QmsTrStatus = "waiting_snapshot" | "pending" | "running" | "completed" | "failed" | "cancelled"

export interface QmsTrStep {
  name: string
  status: string
  started_at: string | null
  completed_at: string | null
  error: string | null
}

export interface QmsTrSnapshotTabla {
  table: string
  table_fqn: string
  version: number
  timestamp: string
}

export interface QmsTrSnapshot {
  status: "ready" | "waiting"
  at: string
  j: QmsTrSnapshotTabla | null
  tables: QmsTrSnapshotTabla[]
  expected_j_at: string | null
  warnings: string[]
}

export type QmsTrResultado = "aplicado" | "pendiente" | "distinto"

export interface QmsTrValidacionFila {
  sheet: string
  id_ato: number
  id_produto: number | null
  variable: string | null
  esperado: number | string | null
  actual: number | string | null
  anterior: number | string | null
  resultado: QmsTrResultado
}

export interface QmsTrValidacionHoja {
  total: number
  checked: number
  applied: number
  pending: number
  mismatched: number
}

export interface QmsTrValidacion {
  status: "aplicado" | "parcial" | "no_aplicado"
  validated_at: string
  validated_by: string | null
  checked: number
  applied: number
  pending: number
  mismatched: number
  by_sheet: Record<string, QmsTrValidacionHoja>
  rows: QmsTrValidacionFila[]
}

export interface QmsTrRun {
  run_id: string
  country: string
  at: string
  mes_procesamiento: string
  productos: number[]
  status: QmsTrStatus
  current_step: string | null
  steps: QmsTrStep[]
  snapshot: QmsTrSnapshot | null
  run_tag: string | null
  databricks_run_id: string | null
  run_page_url: string | null
  started_at: string | null
  completed_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  error_message: string | null
  validacion: QmsTrValidacion | null
}

export interface QmsTrRunCreate {
  country: string
  /** ISO 8601 con zona horaria */
  at: string
  /** AAAAMM */
  mes_procesamiento: string
  productos?: number[]
}

export const ACTIVE_STATUSES: QmsTrStatus[] = ["waiting_snapshot", "pending", "running"]

/** Nombres de los pasos del job qms_tr_run (task_keys). Desconocidos se muestran tal cual. */
export const STEP_LABELS: Record<string, string> = {
  silver_builder: "Silver",
  panelistas: "Panelistas",
  prep: "Preparación",
  motor_grandes: "Motor (productos grandes)",
  motor_normales: "Motor",
  entrega: "Entregable",
}

export function qmsTrStepLabel(name: string): string {
  return STEP_LABELS[name] ?? name
}

/** Hojas del entregable de Data Quality, en el orden del xlsx (slug de la API -> etiqueta). */
export const SHEET_LABELS: Record<string, string> = {
  imputaciones: "Imputaciones",
  cantidad_envasados: "Cantidad envasados",
  factores: "Factores",
  exclusiones: "Exclusiones",
}

/** Países con motor QMS-TR (claves de ADAPTERS en el repo mtr). */
export const QMSTR_COUNTRIES = ["bolivia", "brasil", "cam", "chile", "colombia", "ecuador", "mexico", "peru"]

/** Etiqueta y color del estado de una corrida. */
export const STATUS_META: Record<string, { label: string; className: string }> = {
  waiting_snapshot: { label: "Esperando snapshot", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  pending: { label: "En cola", className: "bg-muted text-muted-foreground" },
  running: { label: "Ejecutando", className: "bg-primary/15 text-primary" },
  completed: { label: "Completado", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  failed: { label: "Error", className: "bg-destructive/15 text-destructive" },
  cancelled: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
}


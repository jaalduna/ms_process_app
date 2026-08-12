// Import calibration types (used in interfaces below + re-exported for backward compat)
import type {
  CalibrationStepName,
  DatabricksTaskStatus,
  CalibrationStep,
  AggregationOptions,
  CalibrationConfig,
  DataAvailability,
  DataAvailabilityResponse,
} from "@/modules/calibracion/types"
import {
  CALIBRATION_STEP_LABELS,
  CALIBRATION_STEPS,
  DEFAULT_CALIBRATION_CONFIG,
} from "@/modules/calibracion/types"

export type {
  CalibrationStepName,
  DatabricksTaskStatus,
  CalibrationStep,
  AggregationOptions,
  CalibrationConfig,
  DataAvailability,
  DataAvailabilityResponse,
}
export {
  CALIBRATION_STEP_LABELS,
  CALIBRATION_STEPS,
  DEFAULT_CALIBRATION_CONFIG,
}

/** Job execution status. */
export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled"

/** User profile returned by GET /auth/me */
export interface UserInfo {
  email: string
  name: string
  roles: string[]
  countries: string[]
}

/** Request body for POST /trigger */
export interface TriggerRequest {
  country: string
  stage: string
  queries?: string[] | null
  lookback_months?: number | null
  row_limit?: number | null
  period?: string | null
  aggregations?: AggregationOptions
  skip_sync?: boolean
  skip_copy?: boolean
  table_suffix?: string | null
  start_period?: string | null
  final_period?: string | null
  skip_merge?: boolean
  skip_simulation?: boolean
  /**
   * Fuente de J (JAA-1116/JAA-1117). `undefined` o `"sync"` = sincronizar desde
   * SQL Server, el comportamiento de siempre. Cualquier otro valor es el tag de
   * una versión registrada; en ese caso el backend fuerza `skip_sync` porque
   * sincronizar reescribiría J justo antes de leer una versión congelada.
   */
  j_source?: string | null
}

/** Valor de `j_source` que significa "sincronizar" (default). */
export const J_SOURCE_SYNC = "sync"

/**
 * Una versión sincronizada de J, registrada con su tag `_BKP_..._vN`.
 *
 * `period_min`/`period_max` no son decorativos: dos versiones con nombre
 * parecido pueden cubrir rangos distintos (en Bolivia los respaldos `_V0`/`_V1`
 * de SQL Server arrancan en 202201 mientras la tabla viva arranca en 202101),
 * así que el desplegable tiene que mostrarlos para que la elección sea informada.
 */
/** Una tabla bronze fijada por el snapshot (JAA-1121). */
export interface JVersionTable {
  table: string
  table_fqn: string
  delta_version: number
  delta_timestamp: string
  delta_table_id?: string | null
  row_count?: number | null
}

export interface JVersion {
  tag: string
  country: string
  period: string
  table_fqn: string
  delta_version: number
  delta_timestamp: string
  delta_table_id?: string | null
  row_count?: number | null
  period_min?: string | null
  period_max?: string | null
  /** Todo el input del pipeline que el tag congela, J incluida. */
  tables?: JVersionTable[]
  /** Tablas del pipeline que el snapshot NO fija (registros viejos: solo J). */
  missing_tables?: string[]
  run_id?: string | null
  created_by: string
  created_at: string
}

export interface JVersionListResponse {
  items: JVersion[]
}

/** Response from POST /trigger */
export interface TriggerResponse {
  job_id: string
  status: "pending"
  country: string
  stage: string
  tag: string
  queries: string[]
  queries_count: number
  created_at: string
  triggered_by: string
}

/** Single query result within a job */
export interface QueryResult {
  query_name: string
  status: JobStatus
  rows_extracted: number
  estimated_rows: number
  rows_downloaded: number
  table_name: string | null
  duration_seconds: number
  error: string | null
  started_at: string | null
}

/** Summary of a job (in event list) */
export interface EventSummary {
  job_id: string
  status: JobStatus
  country: string
  stage: string
  tag: string
  period?: string
  queries_total: number
  queries_completed: number
  queries_failed: number
  created_at: string
  started_at: string | null
  completed_at: string | null
  triggered_by: string
  error: string | null
  current_query: string | null
  failed_queries: string[]
  running_queries: string[]
  queries_running: number
  total_rows_extracted: number
  steps?: CalibrationStep[]
  current_step?: string | null
  /** JAA-1059: Databricks run identity for the (admin-only) deep link. */
  databricks_run_id?: string | null
  run_page_url?: string | null
  /** JAA-755: exclusive per (country, stage, period) — marks the run used for that scope */
  is_final?: boolean
  /** JAA-755: free-text note, e.g. "aprobada por X" */
  label?: string | null
}

/** Detailed job info including per-query results */
export interface EventDetail extends EventSummary {
  results: QueryResult[]
}

/** Paginated event list response */
export interface EventListResponse {
  items: EventSummary[]
  total: number
  limit: number
  offset: number
}

// JAA-384 C3: align to what the mock + real backend actually return. The mock
// emits {country, completed_at, run_id, period}; the backend's last-calibration
// adds {tag, triggered_by, started_at}. The frontend only reads completed_at
// (+ optional period), but the type must not lie about job_id/stage (never sent).
/** Last sync entry for a country from GET /metadata/last-sync */
export interface LastSyncEntry {
  country: string
  completed_at: string
  run_id: string
  period?: number | string
  tag?: string
  triggered_by?: string
  started_at?: string
}

export interface LastSyncResponse {
  countries: Record<string, LastSyncEntry>
}

/** Last elegibilidad entry for a country from GET /metadata/last-elegibilidad */
export interface LastElegibilidadEntry {
  country: string
  completed_at: string
  run_id: string
  period: number
}

export interface LastElegibilidadResponse {
  countries: Record<string, LastElegibilidadEntry>
}

/** Last weighting entry for a country from GET /metadata/last-weighting */
export interface LastWeightingEntry {
  country: string
  completed_at: string
  run_id: string
  period: number
}

/** Last MTR entry for a country from GET /metadata/last-mtr */
export interface LastMtrEntry {
  country: string
  completed_at: string
  run_id: string
  period: number
}

export interface LastWeightingResponse {
  countries: Record<string, LastWeightingEntry>
}

export interface LastMtrResponse {
  countries: Record<string, LastMtrEntry>
}

/** Country metadata from GET /metadata/countries */
export interface CountryInfo {
  code: string
  queries: string[]
  queries_count: number
  type: "country" | "server"
}

export interface CountriesResponse {
  countries: CountryInfo[]
}

/** Stage metadata from GET /metadata/stages */
export interface StageInfo {
  code: string
  name: string
}

export interface StagesResponse {
  stages: StageInfo[]
}

/** Unified type for last-completion responses from pipeline stages.
 * Sync/calibration endpoints use `job_id`; prices/weighting/mtr use `run_id`. */
export interface LastStageCompletionEntry {
  country: string
  completed_at: string
  job_id?: string
  run_id?: string
  period?: number | string
  stage?: string
}

export interface LastStageCompletionResponse {
  countries: Record<string, LastStageCompletionEntry>
}

/** Standard API error response */
export interface ApiError {
  error: string
  message: string
}

/** In-app feedback (JAA-427 / parent JAA-426) */
export type FeedbackCategory = "bug" | "idea" | "otro"

/** Ticket lifecycle status (JAA-769). */
export type FeedbackStatus = "todo" | "progreso" | "review" | "resuelto" | "cerrado"

/** Context auto-attached to feedback so reports are actionable. */
export interface FeedbackContext {
  module: string
  path: string
  appVersion: string
  user?: string
  sessionId: string
}

/** Body of POST /feedback. */
export interface FeedbackPayload {
  message: string
  category: FeedbackCategory
  contact?: string
  context: FeedbackContext
}

/** Response from POST /feedback (201). */
export interface FeedbackResponse {
  ticket_number: string
  status: FeedbackStatus
  created_at: string
}

/** A feedback ticket as returned by GET /feedback/mine. */
export interface FeedbackTicket {
  ticket_number: string
  message: string
  category: FeedbackCategory | null
  status: FeedbackStatus
  created_at: string
  updated_at: string
}

export interface FeedbackMineResponse {
  tickets: FeedbackTicket[]
}

// -- Process open/close (per stage, per country) --

/** Pipeline stages that can be opened/closed independently per country. */
export type ProcessStage = "precios" | "elegibilidad" | "pesaje" | "calibracion" | "mtr" | "formato4"

/** Whether a stage+country process is open (editable) or closed (locked). */
export type ProcessState = "open" | "closed"

/** A single open/close transition recorded for a stage+country process. */
export interface ProcessHistoryEntry {
  action: ProcessState
  user_name: string
  user_email: string
  at: string
}

/** Current open/close state of one stage for one country, with attribution. */
export interface ProcessEntry {
  country: string
  stage: ProcessStage
  status: ProcessState
  changed_by: string | null
  changed_by_email: string | null
  changed_at: string | null
  history: ProcessHistoryEntry[]
}

/** Response from GET /processes/status: nested by country, then stage. */
export interface ProcessStatusResponse {
  countries: Record<string, Partial<Record<ProcessStage, ProcessEntry>>>
}

/**
 * Shared per-process config (JAA-642): defaults visible to all users.
 * `config` is `{}` when no row exists yet; `editable` is true when the
 * requester may PUT (global `admin` or `{process}:admin`).
 */
export interface ProcessConfigResponse {
  process: string
  scope: string
  config: Record<string, unknown>
  editable: boolean
}

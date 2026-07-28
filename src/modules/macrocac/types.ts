// JAA-1051 — macrocac types. Mirror the mock contract (JAA-1048,
// mock-server/routes/macrocac.js, docs/design/macrocac-api-contract.md) that
// the real backend (JAA-1052, ms-process-api) must implement.

export const MACROCAC_COUNTRIES = ["BO", "CL", "MX", "CO", "EC", "PE"] as const
export type MacrocacCountry = (typeof MACROCAC_COUNTRIES)[number]

export const MACROCAC_TABLES = ["j_atoscompra_new", "j_atoscompra_new_test", "hato_cabecalho_ooh"] as const
export type MacrocacTable = (typeof MACROCAC_TABLES)[number]

export interface MacrocacUpload {
  upload_id: string
  filename: string
  pais: string
  tabla: string
  motivo: string
  filas: number
  columnas: string[]
}

export interface MacrocacRun {
  run_id: string
  status: string
  dry_run: boolean
  pais: string
  tabla: string
  upload_id: string
  created_at: string
  completed_at: string | null
  resultado_lote: unknown[] | null
}

export interface MacrocacMissingColumnsError {
  error: "missing_columns"
  missing_columns: string[]
}

export interface MacrocacBadRequestError {
  error: "bad_request"
  message: string
}

export type MacrocacUploadError = MacrocacMissingColumnsError | MacrocacBadRequestError

export interface MacrocacRunConflictError {
  error: "run_in_progress"
  message: string
  run_id: string
}

export interface MacrocacRunNotFoundError {
  error: "not_found"
  message: string
}

export type MacrocacRunError = MacrocacRunConflictError | MacrocacRunNotFoundError

/**
 * The shared `api` axios instance's response interceptor (src/lib/api.ts)
 * collapses every error body into `{error, message}`, dropping fields like
 * `missing_columns`/`run_id` that the macrocac contract needs. api.ts avoids
 * that by requesting with `validateStatus: () => true` and throwing this
 * error instead, carrying the raw backend body through untouched.
 */
export class MacrocacApiError<T> extends Error {
  status: number
  body: T

  constructor(status: number, body: T) {
    super(`macrocac request failed with status ${status}`)
    this.name = "MacrocacApiError"
    this.status = status
    this.body = body
  }
}

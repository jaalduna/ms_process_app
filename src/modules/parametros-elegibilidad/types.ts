// JAA-547 — eligibility-params editor. Types mirror the frozen JAA-546 API
// contract (ms-process-api). Base path /api/v1/params.

export const ELEG_COUNTRIES = ["BO", "BR", "BR_MOSAICO", "CAM", "CL", "CO", "EC", "MX", "PE"] as const
export type ElegCountry = (typeof ELEG_COUNTRIES)[number]

/** Controlled vocabulary for the variable-selector tables (Q/M_Variables).
 *  MUST stay in sync with mock-server/routes/params.js VARIABLE_VOCAB. */
export const VARIABLE_VOCAB = [
  "Edad",
  "NSE",
  "Region",
  "Genero",
  "Hijos",
  "TipoVivienda",
  "Ocupacion",
  "TamanoHogar",
  "Categoria",
  "Canal",
  "Marca",
  "Frecuencia",
] as const

/** The 4 tables this editor specialises (of the 15 in the contract). */
export const ELEG_TABLES = ["Code_Parametros", "Criterios_Elegibilidad", "Q_Variables", "M_Variables", "Estructura"] as const
export type ElegTable = (typeof ELEG_TABLES)[number]

export type ParamRow = Record<string, string | number | null>

export interface ParamsTableData<R extends ParamRow = ParamRow> {
  country: string
  table: string
  rows: R[]
  updated_at: string | null
  updated_by: string | null
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface PublishDiff {
  row_count_before: number
  row_count_after: number
  added: ParamRow[]
  removed: ParamRow[]
  added_count: number
  removed_count: number
}

export interface PublishResult {
  country: string
  table: string
  publish_id: string
  published_at: string
  parquet_path: string
  versioned_path: string
  row_count: number
  diff: PublishDiff
  warnings: string[]
}

// ---- per-table row shapes -------------------------------------------------

export interface CodeParametrosRow extends ParamRow {
  Variable: string
  Valor: number
  "Observación": string
}

export interface CriteriosRow extends ParamRow {
  IdRegla: number
  Categorias: number
  Semanas: number
  ExCateg: string
  Actos: number
}

export interface EstructuraRow extends ParamRow {
  Muestra_Ideal: number
  "Marginal/Categoría": string
  "Expresión": string
  Secuencia: number
  Jerarquia: number
}

// JAA-581 — weighting-params editor types. Mirror the ms-process-api contract
// (JAA-576 GET / JAA-578 validate / JAA-579 publish) under
// /api/v1/weighting/params/{pais}/...

export const COUNTRIES = [
  { code: "chile", label: "Chile" },
  { code: "mexico", label: "México" },
  { code: "brasil", label: "Brasil" },
  { code: "peru", label: "Perú" },
  { code: "bolivia", label: "Bolivia" },
] as const

export type CountryCode = (typeof COUNTRIES)[number]["code"]

/** Controlled vocabulary for the Q/M variable selectors — selecting from this
 *  set makes "typed a column name that doesn't exist" impossible. MUST stay in
 *  sync with mock-server/routes/weighting-params.js VARIABLE_VOCAB. */
export const VARIABLE_VOCAB = [
  "EDBEQ",
  "IMEQ",
  "NIMEQ",
  "EDBQ",
  "NT",
  "IME_NEW_M",
  "NIME_MES",
  "BEBE_MES",
  "GEO_3",
  "GEO_15",
  "GEO_208",
  "GEO_219",
  "GEO_261",
  "GEO_275",
] as const

export const UNIVERSO_PERIODS = ["Q3-25", "Q4-25", "Q1-26", "Q2-26"] as const
export type UniversoPeriod = (typeof UNIVERSO_PERIODS)[number]

/** Tables that can be published/versioned (Universo goes via the Excel flow,
 *  JAA-582 — not here). */
export type PublishableTable = "idpeso-config" | "variables"

// ---- GET response shapes (JAA-576) ----------------------------------------

export interface IdPesoConfigRow {
  idpeso: number
  nombre: string
  per_min: number
  periodos: number
  obs: string | null
}

export interface IdPesoConfigResponse {
  country: string
  rows: IdPesoConfigRow[]
}

export interface WeightingVariablesResponse {
  country: string
  q_vars: string[]
  m_vars: string[]
}

export interface UniversoRow {
  categoria: string | null
  expresion: string | null
  jerarquia: number | null
  secuencia: number | null
  marginales: number | null
  marginales_por_periodo: Record<string, number>
}

export interface ParamsVersion {
  hash: string
  modified_at: string
  row_count: number
}

export interface UniversoResponse {
  country: string
  rows: UniversoRow[]
  version: ParamsVersion
}

// ---- validate / publish (JAA-578 / JAA-579) -------------------------------

export interface ServerValidationError {
  row: number | null
  field: string
  message: string
}

export interface ValidateResponse {
  valid: boolean
  errors: ServerValidationError[]
}

export interface PublishResponse {
  country: string
  table: string
  version: number
  unchanged: boolean
  author: string
  published_at: string
  hash: string
  diff: { added_count: number; removed_count: number; changed_count: number }
}

/** Request bodies for validate/publish, by table. */
export type IdPesoPayload = { rows: IdPesoConfigRow[] }
export type VariablesPayload = { q_vars: string[]; m_vars: string[] }
export type WeightingParamsPayload = IdPesoPayload | VariablesPayload

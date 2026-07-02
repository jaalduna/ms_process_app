// JAA-581 — weighting-params editor types. Mirror the ms-process-api contract
// (JAA-576 GET / JAA-578 validate / JAA-579 publish) under
// /api/v1/weighting/params/{pais}/...

// ``code`` is the país CODE the weighting-params API is keyed by (AR, BO, …),
// NOT the país name. The /weighting/params/{code}/... endpoints 404 on the name
// (e.g. "chile"); only the /runs + execute endpoints take the país name (JAA-752).
export const COUNTRIES = [
  { code: "AR", label: "Argentina" },
  { code: "BO", label: "Bolivia" },
  { code: "BR", label: "Brasil" },
  { code: "CAM", label: "CAM" },
  { code: "CL", label: "Chile" },
  { code: "CO", label: "Colombia" },
  { code: "EC", label: "Ecuador" },
  { code: "MX", label: "México" },
  { code: "PE", label: "Perú" },
] as const

export type CountryCode = (typeof COUNTRIES)[number]["code"]

/** Lowercase country NAME (as used by /weighting/runs, e.g. "bolivia") → the
 *  país CODE the weighting-params API is keyed by. */
export const COUNTRY_NAME_TO_CODE: Record<string, CountryCode> = {
  argentina: "AR",
  bolivia: "BO",
  brasil: "BR",
  brazil: "BR",
  cam: "CAM",
  chile: "CL",
  colombia: "CO",
  ecuador: "EC",
  mexico: "MX",
  peru: "PE",
}

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

/** POST /weighting/params/{pais}/{tabla}/publish — mirrors the real JAA-579
 *  `WeightingPublishResponse`: `version` is the nested version object (NOT a
 *  flat number). */
export interface PublishResponse {
  country: string
  table: string
  unchanged: boolean
  version: WeightingParamsVersion
}

/** Request bodies for validate/publish, by table.
 *
 *  NOTE (JAA-670): the `idpeso-config` validate/publish endpoints operate on the
 *  weighting HYPERPARAMETERS (`{params: {...}}` — the F-001 dict), NOT on
 *  IdPesoConfigRow rows. The rows GET under the same URL segment is a separate,
 *  read-only resource (parquet-backed). */
export type HyperparamsPayload = { params: Record<string, unknown> }
export type VariablesPayload = { q_vars: string[]; m_vars: string[] }
export type WeightingParamsPayload = HyperparamsPayload | VariablesPayload

// ---- GET /weighting/params/{pais}/execution-params -------------------------

/** Effective weighting hyperparameters: latest published draft merged over the
 *  F-001 defaults. `version` is null when nothing has been published yet. */
export interface ExecutionParamsResponse {
  country: string
  params: Record<string, unknown>
  version: WeightingParamsVersion | null
}

// ---- Universo Excel upload flow (JAA-580 / JAA-583) -----------------------

/** Row counts of the preview diff between the uploaded Excel and the current
 *  published Universo. */
export interface UniversoUploadPreview {
  added: number
  removed: number
  changed: number
}

/** Response of POST /weighting/params/{pais}/universo/upload. The server parses
 *  + validates the .xlsx; on `valid` it mints an `upload_token` to be confirmed
 *  by publish. When invalid, `errors` carries the failing row/column and
 *  `upload_token` is null (nothing is persisted). */
export interface UniversoUploadResponse {
  valid: boolean
  errors: ServerValidationError[]
  preview: UniversoUploadPreview
  upload_token: string | null
}

/** Metadata for one published weighting-params version (history entry). Mirrors
 *  the ms-process-api `WeightingParamsVersion` (JAA-579 / JAA-580). */
export interface WeightingParamsVersion {
  version: number
  version_id: string
  hash: string
  published_by: string | null
  published_at: string
  diff: Record<string, unknown>
}

/** Response of POST /weighting/params/{pais}/universo/publish. `version` is the
 *  nested version object (NOT a flat number) — matches the real JAA-580
 *  `UniversoPublishResponse`. `unchanged` is true when re-publishing identical
 *  content ("Sin cambios"). */
export interface UniversoPublishResponse {
  country: string
  table: string
  unchanged: boolean
  row_count: number
  version: WeightingParamsVersion
}

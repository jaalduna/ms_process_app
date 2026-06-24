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

/** All 15 tables of the eligibility-params contract (params_schema.json).
 *  JAA-547 specialised the first 5; JAA-613 adds the remaining 10. */
export const ELEG_TABLES = [
  "Code_Parametros",
  "Criterios_Elegibilidad",
  "Q_Variables",
  "M_Variables",
  "Estructura",
  // JAA-613 — remaining 10
  "Validation_Conditions",
  "Validation_Combined_Conditions",
  "Origen_NoConsiderar",
  "Imputacion_ExCateg",
  "IdDomicilio_Prueba",
  "IdPainel",
  "Variables",
  "Parametros_Region",
  "Criterios_Elegibilidad_Datas",
  "Criterios_Elegibilidad_ExCateg",
] as const
export type ElegTable = (typeof ELEG_TABLES)[number]

export type ParamRow = Record<string, string | number | null>

export interface ParamsTableData<R extends ParamRow = ParamRow> {
  country: string
  table: string
  rows: R[]
  updated_at: string | null
  updated_by: string | null
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

// ---- JAA-613: remaining 10 tables ----------------------------------------

export interface ValidationConditionsRow extends ParamRow {
  Var: string
  Activa: number
  NotNull: number
  Min: number
  Max: number
  "Solo No Pesado": number
}

export interface CombinedConditionsRow extends ParamRow {
  Var1: string
  Var2: string
  Var3: string
  "Min Var1": number
  "Max Var1": number
  "NotNull Var1": number
  "Min Var2": number
  "Max Var2": number
  "NotNull Var2": number
  "Min Var3": number
  "Max Var3": number
  "NotNull Var3": number
  Activa: number
  "Solo No Pesado": number
  Accion: string
}

export interface OrigenRow extends ParamRow {
  Origen: number
}

export interface ImputacionExCategRow extends ParamRow {
  IdProduto: number
}

export interface IdDomicilioRow extends ParamRow {
  IdDomicilio: number
}

export interface IdPainelRow extends ParamRow {
  IdPainel_J: number
  IdPainel_PD: number
}

export interface VariablesRow extends ParamRow {
  Variable: string
  Valor: string
}

export interface ParametrosRegionRow extends ParamRow {
  R: number
  f_fill_flex: number
  f_fill_strict: number
  f_ok: number
  f_ok_flex: number
}

export interface CriteriosDatasRow extends ParamRow {
  Data_Entrada: string
  Data_Saida: string
}

export interface CriteriosExCategRow extends ParamRow {
  ExCateg: string
  IdProduto: number
}

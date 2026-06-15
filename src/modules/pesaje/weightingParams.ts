// Weighting run parameters exposed in the Pesaje config form.
//
// Source of truth: KWP-pesaje/modules/param_configs.py. Keys use the exact
// upper-case constant names from that module so they map 1:1 to the Databricks
// job `job_parameters` once ms-process-api forwards them. These are GLOBAL
// (same set applied to every country run).
//
// NOTE: MANUAL_COLLAPSES (list of (keep_uig, remove_uig) integer pairs) is
// intentionally NOT exposed here — it needs a dedicated repeatable pair editor
// and is tracked in a follow-up ticket.

export type MetodoBounds = "percentile" | "iqr" | "log"
export type AgregacaoBounds = "union" | "intersection"

export interface WeightingParams {
  N_PERIODOS_OUTLIERS: number
  MAX_ROUNDS_COLAPSO: number
  /** null = only GroupVars at the global max hierarchy are eligible for collapse */
  JERARQUIA_MIN_COLAPSO: number | null
  CORRECAO_BOUNDS: boolean
  METODO_BOUNDS: MetodoBounds
  P_BOUNDS: number
  F_BOUNDS: number
  AGREGACAO_BOUNDS: AgregacaoBounds
  MAX_ERR_RATIO_BOUNDS: number
}

export const DEFAULT_WEIGHTING_PARAMS: WeightingParams = {
  N_PERIODOS_OUTLIERS: 12,
  MAX_ROUNDS_COLAPSO: 50,
  JERARQUIA_MIN_COLAPSO: 1,
  CORRECAO_BOUNDS: true,
  METODO_BOUNDS: "percentile",
  P_BOUNDS: 2,
  F_BOUNDS: 1.1,
  AGREGACAO_BOUNDS: "union",
  MAX_ERR_RATIO_BOUNDS: 2.0,
}

type SelectOption = { value: string; label: string }

export type WeightingFieldDescriptor =
  | {
      key: keyof WeightingParams
      label: string
      help?: string
      control: "number"
      /** allow clearing the field to null */
      nullable?: boolean
      min?: number
      max?: number
      step?: string
    }
  | {
      key: keyof WeightingParams
      label: string
      help?: string
      control: "switch"
    }
  | {
      key: keyof WeightingParams
      label: string
      help?: string
      control: "select"
      options: SelectOption[]
    }

export const WEIGHTING_PARAM_FIELDS: WeightingFieldDescriptor[] = [
  {
    key: "N_PERIODOS_OUTLIERS",
    label: "Periodos para outliers",
    help: "Periodos usados para calcular los outliers",
    control: "number",
    min: 1,
  },
  {
    key: "MAX_ROUNDS_COLAPSO",
    label: "Maximo juntas marginales",
    help: "Maximo de colapsos automaticos permitidos",
    control: "number",
    min: 1,
  },
  {
    key: "JERARQUIA_MIN_COLAPSO",
    label: "Jerarquia minima de colapso",
    help: "Vacio = solo GroupVars de jerarquia maxima",
    control: "number",
    nullable: true,
    min: 1,
  },
  {
    key: "CORRECAO_BOUNDS",
    label: "Correccion de limites",
    help: "Fuerza pesos dentro de [RMin, RMax] tras el colapso",
    control: "switch",
  },
  {
    key: "METODO_BOUNDS",
    label: "Metodo de limites",
    control: "select",
    options: [
      { value: "percentile", label: "Percentil" },
      { value: "iqr", label: "IQR" },
      { value: "log", label: "Log" },
    ],
  },
  {
    key: "P_BOUNDS",
    label: "Percentil inferior de limites",
    control: "number",
    min: 0,
    max: 50,
  },
  {
    key: "F_BOUNDS",
    label: "Factor de margen de limites",
    control: "number",
    min: 0,
    step: "0.01",
  },
  {
    key: "AGREGACAO_BOUNDS",
    label: "Agregacion de limites",
    control: "select",
    options: [
      { value: "union", label: "Union" },
      { value: "intersection", label: "Interseccion" },
    ],
  },
  {
    key: "MAX_ERR_RATIO_BOUNDS",
    label: "Ratio max error correccion/IPF",
    control: "number",
    min: 0,
    step: "0.1",
  },
]

/** Lookup descriptor by parameter key (used by the re-run editor for known keys). */
export const WEIGHTING_PARAM_FIELD_BY_KEY: Record<string, WeightingFieldDescriptor> =
  Object.fromEntries(WEIGHTING_PARAM_FIELDS.map((f) => [f.key, f]))

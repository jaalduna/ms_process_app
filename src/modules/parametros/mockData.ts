/**
 * MOCKUP DATA — Parameters editor (option "C").
 *
 * This is a non-wired UI mockup: all data lives here in memory so the page is
 * fully clickable via `npm run dev` without any backend / parquet plumbing.
 * Shapes mirror the real params_configs/<PAIS>/ parquet tables in KWP-pesaje:
 *   - IdPeso_Config  (9x5 lookup registry)
 *   - Q_Variables / M_Variables (single-column variable selectors)
 *   - Universo       (wide strata matrix: rules + per-period population marginals)
 *
 * When this graduates from mockup to real, replace the in-file constants with
 * react-query hooks against new /params endpoints and keep the validation fns.
 */

export const COUNTRIES = [
  { code: "CL", label: "Chile" },
  { code: "MX", label: "México" },
  { code: "BR", label: "Brasil" },
  { code: "PE", label: "Perú" },
  { code: "BO", label: "Bolivia" },
] as const

export type CountryCode = (typeof COUNTRIES)[number]["code"]

/* ------------------------------------------------------------------ */
/* IdPeso_Config — 9 rows x 5 cols lookup registry                     */
/* ------------------------------------------------------------------ */

export interface IdPesoRow {
  IdPeso: number
  Nombre: string
  Per_Min: number
  Periodos: number
  Obs: string
}

export const ID_PESO_SEED: IdPesoRow[] = [
  { IdPeso: 1, Nombre: "Mensual", Per_Min: 1, Periodos: 1, Obs: "Se realiza todos los meses" },
  { IdPeso: 2, Nombre: "Ult2", Per_Min: 2, Periodos: 2, Obs: "" },
  { IdPeso: 3, Nombre: "Ult3", Per_Min: 3, Periodos: 3, Obs: "" },
  { IdPeso: 4, Nombre: "Ult4", Per_Min: 3, Periodos: 4, Obs: "" },
  { IdPeso: 5, Nombre: "Ult6", Per_Min: 5, Periodos: 6, Obs: "" },
  { IdPeso: 6, Nombre: "Ult12", Per_Min: 11, Periodos: 12, Obs: "" },
  { IdPeso: 7, Nombre: "Ult18", Per_Min: 17, Periodos: 18, Obs: "" },
  { IdPeso: 8, Nombre: "Ult24", Per_Min: 23, Periodos: 24, Obs: "Se realiza todos los meses" },
  { IdPeso: 20, Nombre: "Ult9", Per_Min: 8, Periodos: 9, Obs: "" },
]

/* ------------------------------------------------------------------ */
/* Q/M Variables — selectors against a controlled vocabulary           */
/* ------------------------------------------------------------------ */

/** The set of socio-demographic variables actually present in the panel.
 *  In production this comes from the panel schema; a multi-select against it
 *  is what makes "typed a column name that doesn't exist" impossible. */
export const VARIABLE_VOCAB = [
  "EDBEQ", "IMEQ", "NIMEQ", "EDBQ",
  "NT", "IME_NEW_M", "NIME_MES", "BEBE_MES",
  "GEO_3", "GEO_15", "GEO_208", "GEO_219", "GEO_261", "GEO_275",
]

export interface VariablesSeed {
  q: string[]
  m: string[]
}

export const VARIABLES_SEED: Record<CountryCode, VariablesSeed> = {
  CL: { q: ["EDBEQ"], m: [] },
  MX: { q: ["NIMEQ"], m: ["NIME_MES"] },
  BR: { q: ["IMEQ"], m: ["BEBE_MES", "GEO_208", "GEO_3", "GEO_219"] },
  PE: { q: [], m: ["EDBQ"] },
  BO: { q: ["EDBEQ"], m: [] },
}

/* ------------------------------------------------------------------ */
/* Universo — rules (read-only here) + editable per-period marginals   */
/* ------------------------------------------------------------------ */

export const UNIVERSO_PERIODS = ["Q3-25", "Q4-25", "Q1-26", "Q2-26"] as const
export type UniversoPeriod = (typeof UNIVERSO_PERIODS)[number]

export interface UniversoRow {
  /** stable id for editing */
  id: string
  Jerarquia: number
  Categoria: string
  /** SQL-like filter — frozen in this mockup (user confirmed rules rarely change) */
  Expresion: string
  /** 0 = aggregate/total node, 1 = leaf marginal */
  Marginales: number
  /** population target per period */
  values: Record<UniversoPeriod, number>
}

/** Small CL-shaped sample. The TOTAL row (Marginales=0) must equal the sum of
 *  its leaf rows (Marginales=1) for every period — that reconciliation is the
 *  decisive correctness check surfaced in the review dialog. */
export const UNIVERSO_SEED: UniversoRow[] = [
  {
    id: "total",
    Jerarquia: 0,
    Categoria: "TOTAL Hogares",
    Expresion: "[ALL]",
    Marginales: 0,
    values: { "Q3-25": 6_240_000, "Q4-25": 6_255_000, "Q1-26": 6_270_000, "Q2-26": 6_285_000 },
  },
  {
    id: "abc1",
    Jerarquia: 1,
    Categoria: "ABC1",
    Expresion: "[NSE_AIM] = 8 OR [NSE_AIM] = 9",
    Marginales: 1,
    values: { "Q3-25": 936_000, "Q4-25": 938_250, "Q1-26": 940_500, "Q2-26": 942_750 },
  },
  {
    id: "c2",
    Jerarquia: 1,
    Categoria: "C2",
    Expresion: "[NSE_AIM] = 7",
    Marginales: 1,
    values: { "Q3-25": 1_248_000, "Q4-25": 1_251_000, "Q1-26": 1_254_000, "Q2-26": 1_257_000 },
  },
  {
    id: "c3",
    Jerarquia: 1,
    Categoria: "C3",
    Expresion: "[NSE_AIM] = 6",
    Marginales: 1,
    values: { "Q3-25": 1_560_000, "Q4-25": 1_563_750, "Q1-26": 1_567_500, "Q2-26": 1_571_250 },
  },
  {
    id: "d",
    Jerarquia: 1,
    Categoria: "D",
    Expresion: "[NSE_AIM] = 4 OR [NSE_AIM] = 5",
    Marginales: 1,
    values: { "Q3-25": 1_872_000, "Q4-25": 1_876_500, "Q1-26": 1_881_000, "Q2-26": 1_885_500 },
  },
  {
    id: "e",
    Jerarquia: 1,
    Categoria: "E",
    Expresion: "[NSE_AIM] = 1 OR [NSE_AIM] = 2 OR [NSE_AIM] = 3",
    Marginales: 1,
    values: { "Q3-25": 624_000, "Q4-25": 625_500, "Q1-26": 627_000, "Q2-26": 628_500 },
  },
]

/* ------------------------------------------------------------------ */
/* Validation — the "how do I know it's correct?" engine               */
/* ------------------------------------------------------------------ */

export type Severity = "error" | "warning"

export interface ValidationIssue {
  severity: Severity
  /** where: row/cell/field — shown so the user can find it */
  location: string
  message: string
}

export function validateIdPeso(rows: IdPesoRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const seen = new Set<number>()
  for (const r of rows) {
    if (seen.has(r.IdPeso))
      issues.push({ severity: "error", location: `IdPeso ${r.IdPeso}`, message: "IdPeso duplicado — debe ser único." })
    seen.add(r.IdPeso)
    if (!Number.isInteger(r.Periodos) || r.Periodos < 1)
      issues.push({ severity: "error", location: `${r.Nombre}`, message: "Periodos debe ser un entero ≥ 1." })
    if (!Number.isInteger(r.Per_Min) || r.Per_Min < 0)
      issues.push({ severity: "error", location: `${r.Nombre}`, message: "Per_Min debe ser un entero ≥ 0." })
    if (r.Per_Min > r.Periodos)
      issues.push({ severity: "warning", location: `${r.Nombre}`, message: `Per_Min (${r.Per_Min}) > Periodos (${r.Periodos}); la ventana nunca se llenará.` })
    if (!r.Nombre.trim())
      issues.push({ severity: "error", location: `IdPeso ${r.IdPeso}`, message: "Nombre vacío." })
  }
  return issues
}

export function validateVariables(sel: VariablesSeed): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const vocab = new Set(VARIABLE_VOCAB)
  for (const v of [...sel.q, ...sel.m])
    if (!vocab.has(v))
      issues.push({ severity: "error", location: v, message: "Variable fuera del vocabulario del panel — romperá el pivot." })
  const overlap = sel.q.filter(v => sel.m.includes(v))
  for (const v of overlap)
    issues.push({ severity: "warning", location: v, message: "Variable marcada como trimestral y mensual a la vez." })
  return issues
}

export function validateUniverso(rows: UniversoRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const total = rows.find(r => r.Marginales === 0)
  const leaves = rows.filter(r => r.Marginales === 1)
  for (const r of rows)
    for (const p of UNIVERSO_PERIODS) {
      const v = r.values[p]
      if (!Number.isFinite(v) || v < 0)
        issues.push({ severity: "error", location: `${r.Categoria} · ${p}`, message: "Marginal debe ser un número ≥ 0." })
      if (!Number.isInteger(v))
        issues.push({ severity: "warning", location: `${r.Categoria} · ${p}`, message: "Marginal con decimales; se esperan hogares enteros." })
    }
  // Decisive check: leaves must reconcile to the TOTAL row, per period.
  if (total)
    for (const p of UNIVERSO_PERIODS) {
      const sum = leaves.reduce((acc, r) => acc + (Number(r.values[p]) || 0), 0)
      const declared = Number(total.values[p]) || 0
      const delta = sum - declared
      if (delta !== 0)
        issues.push({
          severity: "error",
          location: `Total · ${p}`,
          message: `La suma de estratos (${sum.toLocaleString("es")}) no cuadra con el TOTAL (${declared.toLocaleString("es")}). Diferencia: ${delta > 0 ? "+" : ""}${delta.toLocaleString("es")}.`,
        })
    }
  return issues
}

/* ------------------------------------------------------------------ */
/* Diff — before → after, for the review dialog                        */
/* ------------------------------------------------------------------ */

export interface DiffEntry {
  location: string
  before: string
  after: string
}

const fmt = (v: unknown) =>
  typeof v === "number" ? v.toLocaleString("es") : v === "" || v == null ? "—" : String(v)

export function diffIdPeso(base: IdPesoRow[], next: IdPesoRow[]): DiffEntry[] {
  const out: DiffEntry[] = []
  const byId = new Map(base.map(r => [r.IdPeso, r]))
  for (const r of next) {
    const b = byId.get(r.IdPeso)
    if (!b) { out.push({ location: `IdPeso ${r.IdPeso}`, before: "—", after: "(fila nueva)" }); continue }
    for (const k of ["Nombre", "Per_Min", "Periodos", "Obs"] as const)
      if (b[k] !== r[k]) out.push({ location: `${r.Nombre} · ${k}`, before: fmt(b[k]), after: fmt(r[k]) })
  }
  return out
}

export function diffVariables(base: VariablesSeed, next: VariablesSeed): DiffEntry[] {
  const out: DiffEntry[] = []
  const line = (kind: "Q" | "M", a: string[], b: string[]) => {
    if (a.join(",") !== b.join(","))
      out.push({ location: `${kind}_Variables`, before: a.length ? a.join(", ") : "—", after: b.length ? b.join(", ") : "—" })
  }
  line("Q", base.q, next.q)
  line("M", base.m, next.m)
  return out
}

export function diffUniverso(base: UniversoRow[], next: UniversoRow[]): DiffEntry[] {
  const out: DiffEntry[] = []
  const byId = new Map(base.map(r => [r.id, r]))
  for (const r of next) {
    const b = byId.get(r.id)
    if (!b) continue
    for (const p of UNIVERSO_PERIODS)
      if (b.values[p] !== r.values[p])
        out.push({ location: `${r.Categoria} · ${p}`, before: fmt(b.values[p]), after: fmt(r.values[p]) })
  }
  return out
}

// JAA-547 — pure client-side validation + diff for the eligibility-params
// editor. These power the *live* UX (instant, structured, rich) and gate the
// publish button. The mock/real backend re-validates server-side as a backstop
// (string error lists per the JAA-546 contract).

import {
  VARIABLE_VOCAB,
  type CodeParametrosRow,
  type CriteriosRow,
  type EstructuraRow,
  type ValidationConditionsRow,
  type CombinedConditionsRow,
  type IdPainelRow,
  type VariablesRow,
  type ParametrosRegionRow,
  type CriteriosDatasRow,
  type CriteriosExCategRow,
  type ParamRow,
} from "./types"

export type Severity = "error" | "warning"

export interface ValidationIssue {
  severity: Severity
  /** where: row/cell/field — shown so the user can find it */
  location: string
  message: string
}

export interface DiffEntry {
  location: string
  before: string
  after: string
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v)
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
/** Flag columns in the validation tables are stored as 0/1. */
const isBinary = (v: unknown): boolean => v === 0 || v === 1

// ---- validators -----------------------------------------------------------

export function validateCodeParametros(rows: CodeParametrosRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const seen = new Set<string>()
  rows.forEach((r, i) => {
    const v = (r.Variable ?? "").toString().trim()
    if (!v) issues.push({ severity: "error", location: `fila ${i + 1}`, message: "Variable vacía — es obligatoria." })
    else if (seen.has(v))
      issues.push({ severity: "error", location: v, message: "Variable duplicada — debe ser única." })
    else seen.add(v)
    if (!isInt(r.Valor))
      issues.push({ severity: "error", location: v || `fila ${i + 1}`, message: "Valor debe ser un entero." })
  })
  return issues
}

export function validateCriterios(rows: CriteriosRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const seen = new Set<number>()
  rows.forEach((r, i) => {
    const loc = isInt(r.IdRegla) ? `IdRegla ${r.IdRegla}` : `fila ${i + 1}`
    if (!isInt(r.IdRegla)) issues.push({ severity: "error", location: `fila ${i + 1}`, message: "IdRegla debe ser un entero." })
    else if (seen.has(r.IdRegla)) issues.push({ severity: "error", location: loc, message: "IdRegla duplicado — debe ser único." })
    else seen.add(r.IdRegla)
    if (!isInt(r.Semanas) || r.Semanas < 1 || r.Semanas > 52)
      issues.push({ severity: "error", location: loc, message: `Semanas (${r.Semanas}) fuera de rango (1–52).` })
    if (!isInt(r.Categorias) || r.Categorias < 0)
      issues.push({ severity: "error", location: loc, message: "Categorias debe ser un entero ≥ 0." })
    if (!isInt(r.Actos) || r.Actos < 0)
      issues.push({ severity: "error", location: loc, message: "Actos debe ser un entero ≥ 0." })
  })
  return issues
}

/** Q/M_Variables — values must come from the controlled vocabulary. */
export function validateVocab(values: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const vocab = new Set<string>(VARIABLE_VOCAB)
  const seen = new Set<string>()
  values.forEach((v) => {
    if (!v || !v.trim()) {
      issues.push({ severity: "error", location: "(vacío)", message: "Variable vacía — selecciona del vocabulario." })
      return
    }
    if (!vocab.has(v))
      issues.push({ severity: "error", location: v, message: "Variable fuera del vocabulario del panel — columna inexistente." })
    else if (seen.has(v)) issues.push({ severity: "warning", location: v, message: "Variable seleccionada más de una vez." })
    else seen.add(v)
  })
  return issues
}

/** Estructura — only Muestra_Ideal is editable; the rest is locked in the UI. */
export function validateEstructura(rows: EstructuraRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  rows.forEach((r) => {
    const loc = (r["Marginal/Categoría"] ?? "").toString() || "(fila)"
    if (!isInt(r.Muestra_Ideal) || r.Muestra_Ideal < 0)
      issues.push({ severity: "error", location: loc, message: "Muestra_Ideal debe ser un entero ≥ 0." })
  })
  return issues
}

// ---- JAA-613: validators for the remaining 10 tables ----------------------

/** Validation_Conditions — per-variable rules: Var unique, Min ≤ Max, flags 0/1. */
export function validateValidationConditions(rows: ValidationConditionsRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const seen = new Set<string>()
  rows.forEach((r, i) => {
    const v = (r.Var ?? "").toString().trim()
    const loc = v || `fila ${i + 1}`
    if (!v) issues.push({ severity: "error", location: `fila ${i + 1}`, message: "Var vacía — es obligatoria." })
    else if (seen.has(v)) issues.push({ severity: "error", location: v, message: "Var duplicada — debe ser única." })
    else seen.add(v)
    if (!isNum(r.Min)) issues.push({ severity: "error", location: loc, message: "Min debe ser numérico." })
    if (!isNum(r.Max)) issues.push({ severity: "error", location: loc, message: "Max debe ser numérico." })
    if (isNum(r.Min) && isNum(r.Max) && r.Min > r.Max)
      issues.push({ severity: "error", location: loc, message: `Min (${r.Min}) no puede ser mayor que Max (${r.Max}).` })
    ;(["Activa", "NotNull", "Solo No Pesado"] as const).forEach((f) => {
      if (!isBinary(r[f])) issues.push({ severity: "error", location: `${loc} · ${f}`, message: `${f} debe ser 0 o 1.` })
    })
  })
  return issues
}

/** Validation_Combined_Conditions — cross-variable rules. Var1 required;
 *  numeric Min/Max/NotNull per VarN; Activa/Solo No Pesado 0/1. */
export function validateCombinedConditions(rows: CombinedConditionsRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  rows.forEach((r, i) => {
    const loc = (r.Var1 ?? "").toString().trim() || `fila ${i + 1}`
    if (!(r.Var1 ?? "").toString().trim())
      issues.push({ severity: "error", location: `fila ${i + 1}`, message: "Var1 vacía — es obligatoria." })
    ;([1, 2, 3] as const).forEach((n) => {
      const hasVar = (r[`Var${n}` as keyof CombinedConditionsRow] ?? "").toString().trim() !== ""
      if (!hasVar) return
      ;([`Min Var${n}`, `Max Var${n}`, `NotNull Var${n}`] as const).forEach((f) => {
        if (!isNum(r[f as keyof CombinedConditionsRow] as number))
          issues.push({ severity: "error", location: `${loc} · ${f}`, message: `${f} debe ser numérico.` })
      })
    })
    ;(["Activa", "Solo No Pesado"] as const).forEach((f) => {
      if (!isBinary(r[f])) issues.push({ severity: "error", location: `${loc} · ${f}`, message: `${f} debe ser 0 o 1.` })
    })
  })
  return issues
}

/** Single-column integer exclusion lists (Origen / IdProduto / IdDomicilio). */
export function validateNumericList(values: number[], label: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const seen = new Set<number>()
  values.forEach((v, i) => {
    if (!isInt(v)) {
      issues.push({ severity: "error", location: `fila ${i + 1}`, message: `${label} debe ser un entero.` })
      return
    }
    if (seen.has(v)) issues.push({ severity: "error", location: String(v), message: `${label} duplicado — debe ser único.` })
    else seen.add(v)
  })
  return issues
}

/** IdPainel — two integer ids per row, both required. */
export function validateIdPainel(rows: IdPainelRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  rows.forEach((r, i) => {
    if (!isInt(r.IdPainel_J))
      issues.push({ severity: "error", location: `fila ${i + 1}`, message: "IdPainel_J debe ser un entero." })
    if (!isInt(r.IdPainel_PD))
      issues.push({ severity: "error", location: `fila ${i + 1}`, message: "IdPainel_PD debe ser un entero." })
  })
  return issues
}

/** Variables — string key-value; Variable unique + non-empty, Valor non-empty. */
export function validateVariables(rows: VariablesRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const seen = new Set<string>()
  rows.forEach((r, i) => {
    const k = (r.Variable ?? "").toString().trim()
    if (!k) issues.push({ severity: "error", location: `fila ${i + 1}`, message: "Variable vacía — es obligatoria." })
    else if (seen.has(k)) issues.push({ severity: "error", location: k, message: "Variable duplicada — debe ser única." })
    else seen.add(k)
    if (!(r.Valor ?? "").toString().trim())
      issues.push({ severity: "error", location: k || `fila ${i + 1}`, message: "Valor vacío — es obligatorio." })
  })
  return issues
}

/** Parametros_Region — R integer unique; factors are finite numbers (floats ok). */
export function validateParametrosRegion(rows: ParametrosRegionRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const seen = new Set<number>()
  const factors: (keyof ParametrosRegionRow)[] = ["f_fill_flex", "f_fill_strict", "f_ok", "f_ok_flex"]
  rows.forEach((r, i) => {
    const loc = isInt(r.R) ? `R ${r.R}` : `fila ${i + 1}`
    if (!isInt(r.R)) issues.push({ severity: "error", location: `fila ${i + 1}`, message: "R debe ser un entero." })
    else if (seen.has(r.R)) issues.push({ severity: "error", location: loc, message: "R duplicado — debe ser único." })
    else seen.add(r.R)
    factors.forEach((f) => {
      if (!isNum(r[f] as number))
        issues.push({ severity: "error", location: `${loc} · ${String(f)}`, message: `${String(f)} debe ser numérico.` })
    })
  })
  return issues
}

/** Criterios_Elegibilidad_Datas — Data_Saida is the required temporal column. */
export function validateCriteriosDatas(rows: CriteriosDatasRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  rows.forEach((r, i) => {
    if (!(r.Data_Saida ?? "").toString().trim())
      issues.push({ severity: "error", location: `fila ${i + 1}`, message: "Data_Saida vacía — es obligatoria." })
  })
  return issues
}

/** Criterios_Elegibilidad_ExCateg — ExCateg required, IdProduto integer. */
export function validateCriteriosExCateg(rows: CriteriosExCategRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  rows.forEach((r, i) => {
    const loc = (r.ExCateg ?? "").toString().trim() || `fila ${i + 1}`
    if (!(r.ExCateg ?? "").toString().trim())
      issues.push({ severity: "error", location: `fila ${i + 1}`, message: "ExCateg vacía — es obligatoria." })
    if (!isInt(r.IdProduto))
      issues.push({ severity: "error", location: loc, message: "IdProduto debe ser un entero." })
  })
  return issues
}

// ---- diff (cell-level, before→after) --------------------------------------

const fmt = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—"
  if (typeof v === "number") return v.toLocaleString("es")
  return String(v)
}

/**
 * Generic cell-level diff keyed by a stable row key. New rows appear as a
 * single "(fila nueva)" entry; removed rows as "(fila eliminada)".
 */
export function diffByKey<R extends ParamRow>(
  baseline: R[],
  draft: R[],
  keyOf: (r: R) => string,
  fields: (keyof R)[],
  labelOf: (r: R) => string,
): DiffEntry[] {
  const entries: DiffEntry[] = []
  const baseMap = new Map(baseline.map((r) => [keyOf(r), r]))
  const draftMap = new Map(draft.map((r) => [keyOf(r), r]))
  for (const r of draft) {
    const k = keyOf(r)
    const prev = baseMap.get(k)
    if (!prev) {
      entries.push({ location: labelOf(r), before: "—", after: "(fila nueva)" })
      continue
    }
    for (const f of fields) {
      if (fmt(prev[f]) !== fmt(r[f]))
        entries.push({ location: `${labelOf(r)} · ${String(f)}`, before: fmt(prev[f]), after: fmt(r[f]) })
    }
  }
  for (const r of baseline) {
    if (!draftMap.has(keyOf(r))) entries.push({ location: labelOf(r), before: "(fila eliminada)", after: "—" })
  }
  return entries
}

/**
 * Position-based diff — correct for tables whose key column is itself editable
 * (Code_Parametros, Q/M_Variables) or that have no natural key.
 */
export function diffByIndex<R extends ParamRow>(
  baseline: R[],
  draft: R[],
  fields: (keyof R)[],
  labelOf: (r: R, i: number) => string,
): DiffEntry[] {
  const entries: DiffEntry[] = []
  const max = Math.max(baseline.length, draft.length)
  for (let i = 0; i < max; i++) {
    const prev = baseline[i]
    const cur = draft[i]
    if (!prev && cur) {
      entries.push({ location: labelOf(cur, i), before: "—", after: "(fila nueva)" })
      continue
    }
    if (prev && !cur) {
      entries.push({ location: labelOf(prev, i), before: "(fila eliminada)", after: "—" })
      continue
    }
    if (!prev || !cur) continue
    for (const f of fields) {
      if (fmt(prev[f]) !== fmt(cur[f]))
        entries.push({ location: `${labelOf(cur, i)} · ${String(f)}`, before: fmt(prev[f]), after: fmt(cur[f]) })
    }
  }
  return entries
}

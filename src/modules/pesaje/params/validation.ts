// JAA-581 — pure client-side validation + diff for the weighting-params editor.
// These power the *live* UX (instant StatusPill + dialog checklist). The server
// `/validate` endpoint (JAA-578) re-validates as the authoritative backstop and
// its structured errors are merged into the dialog inline.

import type {
  IdPesoConfigRow,
  ServerValidationError,
  UniversoRow,
  VariablesPayload,
} from "./types"
import { UNIVERSO_PERIODS, VARIABLE_VOCAB } from "./types"

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

const fmt = (v: unknown) =>
  typeof v === "number" ? v.toLocaleString("es") : v === "" || v == null ? "—" : String(v)

// ---- validators -----------------------------------------------------------

export function validateIdPeso(rows: IdPesoConfigRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const seen = new Set<number>()
  for (const r of rows) {
    if (seen.has(r.idpeso))
      issues.push({ severity: "error", location: `IdPeso ${r.idpeso}`, message: "IdPeso duplicado — debe ser único." })
    seen.add(r.idpeso)
    if (!Number.isInteger(r.periodos) || r.periodos < 1)
      issues.push({ severity: "error", location: r.nombre || `IdPeso ${r.idpeso}`, message: "Periodos debe ser un entero ≥ 1." })
    if (!Number.isInteger(r.per_min) || r.per_min < 0)
      issues.push({ severity: "error", location: r.nombre || `IdPeso ${r.idpeso}`, message: "Per_Min debe ser un entero ≥ 0." })
    if (r.per_min > r.periodos)
      issues.push({ severity: "warning", location: r.nombre || `IdPeso ${r.idpeso}`, message: `Per_Min (${r.per_min}) > Periodos (${r.periodos}); la ventana nunca se llenará.` })
    if (!r.nombre || !r.nombre.trim())
      issues.push({ severity: "error", location: `IdPeso ${r.idpeso}`, message: "Nombre vacío." })
  }
  return issues
}

export function validateVariables(sel: VariablesPayload): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const vocab = new Set<string>(VARIABLE_VOCAB)
  for (const v of [...sel.q_vars, ...sel.m_vars])
    if (!vocab.has(v))
      issues.push({ severity: "error", location: v, message: "Variable fuera del vocabulario del panel — romperá el pivot." })
  const overlap = sel.q_vars.filter((v) => sel.m_vars.includes(v))
  for (const v of overlap)
    issues.push({ severity: "warning", location: v, message: "Variable marcada como trimestral y mensual a la vez." })
  return issues
}

export function validateUniverso(rows: UniversoRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const total = rows.find((r) => r.marginales === 0)
  const leaves = rows.filter((r) => r.marginales === 1)
  for (const r of rows)
    for (const p of UNIVERSO_PERIODS) {
      const v = r.marginales_por_periodo[p]
      if (!Number.isFinite(v) || v < 0)
        issues.push({ severity: "error", location: `${r.categoria} · ${p}`, message: "Marginal debe ser un número ≥ 0." })
    }
  if (total)
    for (const p of UNIVERSO_PERIODS) {
      const sum = leaves.reduce((acc, r) => acc + (Number(r.marginales_por_periodo[p]) || 0), 0)
      const declared = Number(total.marginales_por_periodo[p]) || 0
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

/** Live validation of the F-001 weighting hyperparameters draft — mirrors the
 *  server rules (ms-process-api `weighting_validators._validate_hyperparam`,
 *  vendor-ported from KWP-pesaje param_configs_validation.py). */
export function validateHyperparams(params: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const err = (location: string, message: string) =>
    issues.push({ severity: "error", location, message })
  const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v)
  const isReal = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)

  const p = params
  if ("N_PERIODOS_OUTLIERS" in p && (!isInt(p.N_PERIODOS_OUTLIERS) || p.N_PERIODOS_OUTLIERS <= 0))
    err("N_PERIODOS_OUTLIERS", "Debe ser un entero > 0.")
  if ("MAX_ROUNDS_COLAPSO" in p && (!isInt(p.MAX_ROUNDS_COLAPSO) || p.MAX_ROUNDS_COLAPSO < 0))
    err("MAX_ROUNDS_COLAPSO", "Debe ser un entero ≥ 0 (0 = una sola pasada de IPF sin colapso automático).")
  if ("JERARQUIA_MIN_COLAPSO" in p && p.JERARQUIA_MIN_COLAPSO !== null && (!isInt(p.JERARQUIA_MIN_COLAPSO) || p.JERARQUIA_MIN_COLAPSO < 1))
    err("JERARQUIA_MIN_COLAPSO", "Debe ser vacío (None) o un entero ≥ 1.")
  if ("CORRECAO_BOUNDS" in p && typeof p.CORRECAO_BOUNDS !== "boolean")
    err("CORRECAO_BOUNDS", "Debe ser booleano (true/false).")
  if ("METODO_BOUNDS" in p && !["percentile", "iqr", "log"].includes(String(p.METODO_BOUNDS)))
    err("METODO_BOUNDS", "Debe ser uno de: percentile, iqr, log.")
  if ("P_BOUNDS" in p && (!isInt(p.P_BOUNDS) || !(Number(p.P_BOUNDS) > 0 && Number(p.P_BOUNDS) < 50)))
    err("P_BOUNDS", "Debe ser un entero con 0 < P_BOUNDS < 50 (percentil inferior).")
  if ("F_BOUNDS" in p && (!isReal(p.F_BOUNDS) || Number(p.F_BOUNDS) <= 0))
    err("F_BOUNDS", "Debe ser un número > 0.")
  if ("AGREGACAO_BOUNDS" in p && !["union", "intersection"].includes(String(p.AGREGACAO_BOUNDS)))
    err("AGREGACAO_BOUNDS", "Debe ser uno de: union, intersection.")
  if ("MAX_ERR_RATIO_BOUNDS" in p && (!isReal(p.MAX_ERR_RATIO_BOUNDS) || Number(p.MAX_ERR_RATIO_BOUNDS) <= 0))
    err("MAX_ERR_RATIO_BOUNDS", "Debe ser un número > 0.")
  return issues
}

export function diffHyperparams(
  base: Record<string, unknown>,
  next: Record<string, unknown>,
): DiffEntry[] {
  const out: DiffEntry[] = []
  for (const key of Object.keys(next))
    if (JSON.stringify(base[key] ?? null) !== JSON.stringify(next[key] ?? null))
      out.push({ location: key, before: fmt(base[key]), after: fmt(next[key]) })
  return out
}

/** Map server validate errors (row/field/message) into the dialog's issue shape. */
export function serverErrorsToIssues(errors: ServerValidationError[]): ValidationIssue[] {
  return errors.map((e) => ({
    severity: "error" as const,
    location: e.row != null ? `fila ${e.row + 1} · ${e.field}` : e.field,
    message: e.message,
  }))
}

// ---- diff -----------------------------------------------------------------

export function diffIdPeso(base: IdPesoConfigRow[], next: IdPesoConfigRow[]): DiffEntry[] {
  const out: DiffEntry[] = []
  const byId = new Map(base.map((r) => [r.idpeso, r]))
  for (const r of next) {
    const b = byId.get(r.idpeso)
    if (!b) {
      out.push({ location: `IdPeso ${r.idpeso}`, before: "—", after: "(fila nueva)" })
      continue
    }
    for (const k of ["nombre", "per_min", "periodos", "obs"] as const)
      if (b[k] !== r[k]) out.push({ location: `${r.nombre} · ${k}`, before: fmt(b[k]), after: fmt(r[k]) })
  }
  return out
}

export function diffVariables(base: VariablesPayload, next: VariablesPayload): DiffEntry[] {
  const out: DiffEntry[] = []
  const line = (kind: "Q" | "M", a: string[], b: string[]) => {
    if (a.join(",") !== b.join(","))
      out.push({ location: `${kind}_Variables`, before: a.length ? a.join(", ") : "—", after: b.length ? b.join(", ") : "—" })
  }
  line("Q", base.q_vars, next.q_vars)
  line("M", base.m_vars, next.m_vars)
  return out
}

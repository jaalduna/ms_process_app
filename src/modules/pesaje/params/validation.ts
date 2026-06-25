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

// JAA-628 — adapt the backend Excel-import preview (ImportResult, per-country /
// all-tables) into the shapes the existing ReviewPublishDialog consumes
// (ValidationIssue[] + DiffEntry[]). The frontend does NOT revalidate the
// contract: it only renders the errors/diff the backend /import returns.

import type { ImportResult, ParamRow } from "./types"
import type { DiffEntry, ValidationIssue } from "./validation"

/** Compact one row into a stable, human-readable `k=v, k=v` string. */
export function summarizeRow(row: ParamRow): string {
  const parts = Object.entries(row).map(([k, v]) => `${k}=${v ?? "∅"}`)
  return parts.length > 0 ? parts.join(", ") : "(fila vacía)"
}

export interface ReviewModel {
  issues: ValidationIssue[]
  diff: DiffEntry[]
}

/**
 * Flatten a per-country ImportResult into the dialog model.
 *  - errors  -> ValidationIssue{severity:"error", location:<table>}
 *  - warnings-> ValidationIssue{severity:"warning", location:<table>}
 *  - diff.added rows   -> DiffEntry{before:"—", after:<row>}
 *  - diff.removed rows -> DiffEntry{before:<row>, after:"—"}
 * Order is table-by-table, errors before warnings, added before removed, so the
 * rendered output is deterministic (and unit-testable).
 */
export function mapImportResult(result: ImportResult): ReviewModel {
  const issues: ValidationIssue[] = []
  const diff: DiffEntry[] = []

  for (const tbl of result.tables) {
    for (const message of tbl.errors) {
      issues.push({ severity: "error", location: tbl.table, message })
    }
    for (const message of tbl.warnings) {
      issues.push({ severity: "warning", location: tbl.table, message })
    }
    for (const row of tbl.diff.added) {
      diff.push({ location: `${tbl.table} (+)`, before: "—", after: summarizeRow(row) })
    }
    for (const row of tbl.diff.removed) {
      diff.push({ location: `${tbl.table} (−)`, before: summarizeRow(row), after: "—" })
    }
  }

  return { issues, diff }
}

/** Tables whose upload actually changed rows — the set to re-publish. */
export function changedTables(result: ImportResult) {
  return result.tables.filter((t) => t.diff.added_count + t.diff.removed_count > 0)
}

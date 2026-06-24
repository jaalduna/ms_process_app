import { describe, it, expect } from "vitest"
import { mapImportResult, changedTables, summarizeRow } from "../importMapping"
import type { ImportResult, ImportTableResult } from "../types"

function table(partial: Partial<ImportTableResult> & { table: string }): ImportTableResult {
  return {
    table: partial.table,
    rows: partial.rows ?? [],
    diff: partial.diff ?? {
      row_count_before: 0,
      row_count_after: 0,
      added: [],
      removed: [],
      added_count: 0,
      removed_count: 0,
    },
    errors: partial.errors ?? [],
    warnings: partial.warnings ?? [],
  }
}

describe("summarizeRow", () => {
  it("renders k=v pairs joined by comma", () => {
    expect(summarizeRow({ Variable: "umbral", Valor: 7 })).toBe("Variable=umbral, Valor=7")
  })
  it("renders null/undefined as ∅ and empty rows as a placeholder", () => {
    expect(summarizeRow({ Valor: null })).toBe("Valor=∅")
    expect(summarizeRow({})).toBe("(fila vacía)")
  })
})

describe("mapImportResult", () => {
  it("maps errors and warnings to located ValidationIssues", () => {
    const result: ImportResult = {
      country: "CL",
      valid: false,
      tables: [
        table({
          table: "Code_Parametros",
          errors: ["row 0: 'Valor' is not a valid integer"],
          warnings: ["row 1: duplicated selection"],
        }),
      ],
    }
    const { issues } = mapImportResult(result)
    expect(issues).toEqual([
      { severity: "error", location: "Code_Parametros", message: "row 0: 'Valor' is not a valid integer" },
      { severity: "warning", location: "Code_Parametros", message: "row 1: duplicated selection" },
    ])
  })

  it("maps added rows to before→after diff entries and removed rows in reverse", () => {
    const result: ImportResult = {
      country: "CL",
      valid: true,
      tables: [
        table({
          table: "Code_Parametros",
          diff: {
            row_count_before: 1,
            row_count_after: 1,
            added: [{ Variable: "nuevo", Valor: 9 }],
            removed: [{ Variable: "viejo", Valor: 1 }],
            added_count: 1,
            removed_count: 1,
          },
        }),
      ],
    }
    const { diff } = mapImportResult(result)
    expect(diff).toEqual([
      { location: "Code_Parametros (+)", before: "—", after: "Variable=nuevo, Valor=9" },
      { location: "Code_Parametros (−)", before: "Variable=viejo, Valor=1", after: "—" },
    ])
  })

  it("produces no issues and no diff for a clean, unchanged result", () => {
    const result: ImportResult = {
      country: "CL",
      valid: true,
      tables: [table({ table: "Estructura" })],
    }
    expect(mapImportResult(result)).toEqual({ issues: [], diff: [] })
  })
})

describe("changedTables", () => {
  it("keeps only tables with a non-zero add/remove count", () => {
    const result: ImportResult = {
      country: "CL",
      valid: true,
      tables: [
        table({ table: "A", diff: { row_count_before: 0, row_count_after: 1, added: [{ x: 1 }], removed: [], added_count: 1, removed_count: 0 } }),
        table({ table: "B" }),
      ],
    }
    expect(changedTables(result).map((t) => t.table)).toEqual(["A"])
  })
})

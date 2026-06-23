import { describe, expect, it } from "vitest"
import {
  validateCodeParametros,
  validateCriterios,
  validateVocab,
  validateEstructura,
  diffByKey,
  diffByIndex,
} from "../validation"
import type { CodeParametrosRow, CriteriosRow } from "../types"

describe("eligibility params validation (JAA-547)", () => {
  describe("Code_Parametros", () => {
    it("flags a duplicate Variable as an error", () => {
      const rows: CodeParametrosRow[] = [
        { Variable: "x", Valor: 1, "Observación": "" },
        { Variable: "x", Valor: 2, "Observación": "" },
      ]
      const issues = validateCodeParametros(rows)
      const errs = issues.filter((i) => i.severity === "error")
      expect(errs.some((e) => /duplicada/i.test(e.message))).toBe(true)
    })

    it("flags a non-integer Valor as an error", () => {
      const rows = [{ Variable: "x", Valor: "nope" as unknown as number, "Observación": "" }]
      const issues = validateCodeParametros(rows as CodeParametrosRow[])
      expect(issues.some((i) => i.severity === "error" && /entero/i.test(i.message))).toBe(true)
    })

    it("passes for clean rows", () => {
      const rows: CodeParametrosRow[] = [{ Variable: "x", Valor: 1, "Observación": "" }]
      expect(validateCodeParametros(rows)).toEqual([])
    })
  })

  describe("Criterios_Elegibilidad", () => {
    it("flags Semanas out of range (1..52)", () => {
      const rows: CriteriosRow[] = [{ IdRegla: 1, Categorias: 2, Semanas: 99, ExCateg: "", Actos: 3 }]
      const issues = validateCriterios(rows)
      expect(issues.some((i) => /Semanas/i.test(i.message))).toBe(true)
    })

    it("flags a duplicate IdRegla", () => {
      const rows: CriteriosRow[] = [
        { IdRegla: 1, Categorias: 2, Semanas: 10, ExCateg: "", Actos: 3 },
        { IdRegla: 1, Categorias: 2, Semanas: 10, ExCateg: "", Actos: 3 },
      ]
      expect(validateCriterios(rows).some((i) => /duplicado/i.test(i.message))).toBe(true)
    })
  })

  describe("Q/M_Variables vocab", () => {
    it("flags an out-of-vocabulary variable", () => {
      const issues = validateVocab(["Edad", "__nope__"])
      expect(issues.some((i) => i.severity === "error" && /vocabulario/i.test(i.message))).toBe(true)
    })
    it("passes for in-vocab variables", () => {
      expect(validateVocab(["Edad", "NSE"]).filter((i) => i.severity === "error")).toEqual([])
    })
  })

  describe("Estructura", () => {
    it("flags a negative Muestra_Ideal", () => {
      const issues = validateEstructura([
        { Muestra_Ideal: -1, "Marginal/Categoría": "ABC1", "Expresión": "x", Secuencia: 1, Jerarquia: 1 },
      ])
      expect(issues.some((i) => i.severity === "error")).toBe(true)
    })
  })

  describe("diffByKey", () => {
    it("reports a changed cell as before→after", () => {
      const base: CodeParametrosRow[] = [{ Variable: "x", Valor: 1, "Observación": "" }]
      const draft: CodeParametrosRow[] = [{ Variable: "x", Valor: 5, "Observación": "" }]
      const diff = diffByKey(base, draft, (r) => r.Variable, ["Valor"], (r) => r.Variable)
      expect(diff).toHaveLength(1)
      expect(diff[0]).toMatchObject({ before: "1", after: "5" })
    })

    it("reports a new row", () => {
      const base: CodeParametrosRow[] = []
      const draft: CodeParametrosRow[] = [{ Variable: "n", Valor: 1, "Observación": "" }]
      const diff = diffByKey(base, draft, (r) => r.Variable, ["Valor"], (r) => r.Variable)
      expect(diff.some((d) => d.after === "(fila nueva)")).toBe(true)
    })
  })

  describe("diffByIndex", () => {
    it("reports a changed cell even when the key column is edited", () => {
      const base: CodeParametrosRow[] = [{ Variable: "x", Valor: 1, "Observación": "" }]
      const draft: CodeParametrosRow[] = [{ Variable: "y", Valor: 1, "Observación": "" }]
      const diff = diffByIndex(base, draft, ["Variable", "Valor"], (r) => r.Variable)
      expect(diff.some((d) => d.before === "x" && d.after === "y")).toBe(true)
    })

    it("reports added and removed rows by position", () => {
      const base: CodeParametrosRow[] = [{ Variable: "x", Valor: 1, "Observación": "" }]
      const draft: CodeParametrosRow[] = [
        { Variable: "x", Valor: 1, "Observación": "" },
        { Variable: "z", Valor: 2, "Observación": "" },
      ]
      const diff = diffByIndex(base, draft, ["Variable", "Valor"], (r) => r.Variable)
      expect(diff.some((d) => d.after === "(fila nueva)")).toBe(true)
    })
  })
})

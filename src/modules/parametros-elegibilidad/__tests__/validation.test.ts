import { describe, expect, it } from "vitest"
import {
  validateCodeParametros,
  validateCriterios,
  validateVocab,
  validateEstructura,
  validateValidationConditions,
  validateCombinedConditions,
  validateNumericList,
  validateIdPainel,
  validateVariables,
  validateParametrosRegion,
  validateCriteriosDatas,
  validateCriteriosExCateg,
  diffByKey,
  diffByIndex,
  type ValidationIssue,
} from "../validation"
import type {
  CodeParametrosRow,
  CriteriosRow,
  ValidationConditionsRow,
  CombinedConditionsRow,
  IdPainelRow,
  VariablesRow,
  ParametrosRegionRow,
  CriteriosDatasRow,
  CriteriosExCategRow,
} from "../types"

const errsOf = (issues: ValidationIssue[]) => issues.filter((i) => i.severity === "error")

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

describe("eligibility params validation — remaining tables (JAA-613)", () => {
  const vcRow = (o: Partial<ValidationConditionsRow> = {}): ValidationConditionsRow => ({
    Var: "Edad",
    Activa: 1,
    NotNull: 0,
    Min: 0,
    Max: 10,
    "Solo No Pesado": 0,
    ...o,
  })

  describe("Validation_Conditions", () => {
    it("flags an empty Var", () => {
      expect(errsOf(validateValidationConditions([vcRow({ Var: "" })])).length).toBeGreaterThan(0)
    })
    it("flags a duplicate Var", () => {
      const issues = validateValidationConditions([vcRow(), vcRow()])
      expect(errsOf(issues).some((e) => /duplicad/i.test(e.message))).toBe(true)
    })
    it("flags Min > Max", () => {
      const issues = validateValidationConditions([vcRow({ Min: 9, Max: 1 })])
      expect(errsOf(issues).some((e) => /Min/i.test(e.message))).toBe(true)
    })
    it("flags a non-binary flag column", () => {
      const issues = validateValidationConditions([vcRow({ Activa: 2 })])
      expect(errsOf(issues).some((e) => /0 o 1/i.test(e.message))).toBe(true)
    })
    it("passes for clean rows", () => {
      expect(errsOf(validateValidationConditions([vcRow()]))).toEqual([])
    })
  })

  describe("Validation_Combined_Conditions", () => {
    const ccRow = (o: Partial<CombinedConditionsRow> = {}): CombinedConditionsRow => ({
      Var1: "Edad",
      Var2: "",
      Var3: "",
      "Min Var1": 0,
      "Max Var1": 10,
      "NotNull Var1": 0,
      "Min Var2": 0,
      "Max Var2": 0,
      "NotNull Var2": 0,
      "Min Var3": 0,
      "Max Var3": 0,
      "NotNull Var3": 0,
      Activa: 1,
      "Solo No Pesado": 0,
      Accion: "excluir",
      ...o,
    })
    it("flags an empty Var1", () => {
      expect(errsOf(validateCombinedConditions([ccRow({ Var1: "" })])).length).toBeGreaterThan(0)
    })
    it("flags a non-binary Activa", () => {
      expect(errsOf(validateCombinedConditions([ccRow({ Activa: 5 })])).length).toBeGreaterThan(0)
    })
    it("passes for clean rows", () => {
      expect(errsOf(validateCombinedConditions([ccRow()]))).toEqual([])
    })
  })

  describe("validateNumericList (exclusion lists)", () => {
    it("flags a non-integer entry", () => {
      const issues = validateNumericList([1, 2.5, 3], "Origen")
      expect(errsOf(issues).some((e) => /entero/i.test(e.message))).toBe(true)
    })
    it("flags a duplicate entry", () => {
      const issues = validateNumericList([7, 7], "IdProduto")
      expect(errsOf(issues).some((e) => /duplicad/i.test(e.message))).toBe(true)
    })
    it("passes for clean integers", () => {
      expect(errsOf(validateNumericList([1, 2, 3], "Origen"))).toEqual([])
    })
  })

  describe("IdPainel", () => {
    const row = (o: Partial<IdPainelRow> = {}): IdPainelRow => ({ IdPainel_J: 1, IdPainel_PD: 2, ...o })
    it("flags a non-integer IdPainel_J", () => {
      expect(errsOf(validateIdPainel([row({ IdPainel_J: 1.5 })])).length).toBeGreaterThan(0)
    })
    it("passes for clean rows", () => {
      expect(errsOf(validateIdPainel([row()]))).toEqual([])
    })
  })

  describe("Variables (string key-value)", () => {
    const row = (o: Partial<VariablesRow> = {}): VariablesRow => ({ Variable: "k", Valor: "v", ...o })
    it("flags an empty Variable", () => {
      expect(errsOf(validateVariables([row({ Variable: "" })])).length).toBeGreaterThan(0)
    })
    it("flags a duplicate Variable", () => {
      expect(errsOf(validateVariables([row(), row()])).some((e) => /duplicad/i.test(e.message))).toBe(true)
    })
    it("flags an empty Valor", () => {
      expect(errsOf(validateVariables([row({ Valor: "" })])).length).toBeGreaterThan(0)
    })
    it("passes for clean rows", () => {
      expect(errsOf(validateVariables([row()]))).toEqual([])
    })
  })

  describe("Parametros_Region", () => {
    const row = (o: Partial<ParametrosRegionRow> = {}): ParametrosRegionRow => ({
      R: 1,
      f_fill_flex: 0.5,
      f_fill_strict: 0.8,
      f_ok: 1.0,
      f_ok_flex: 0.9,
      ...o,
    })
    it("accepts float factors", () => {
      expect(errsOf(validateParametrosRegion([row()]))).toEqual([])
    })
    it("flags a non-integer R", () => {
      expect(errsOf(validateParametrosRegion([row({ R: 1.5 })])).length).toBeGreaterThan(0)
    })
    it("flags a duplicate R", () => {
      expect(errsOf(validateParametrosRegion([row(), row()])).some((e) => /duplicad/i.test(e.message))).toBe(true)
    })
    it("flags a non-numeric factor", () => {
      expect(errsOf(validateParametrosRegion([row({ f_ok: NaN })])).length).toBeGreaterThan(0)
    })
  })

  describe("Criterios_Elegibilidad_Datas", () => {
    const row = (o: Partial<CriteriosDatasRow> = {}): CriteriosDatasRow => ({
      Data_Entrada: "2024-01-01",
      Data_Saida: "2024-12-31",
      ...o,
    })
    it("flags an empty Data_Saida (required)", () => {
      expect(errsOf(validateCriteriosDatas([row({ Data_Saida: "" })])).length).toBeGreaterThan(0)
    })
    it("passes when Data_Saida is present", () => {
      expect(errsOf(validateCriteriosDatas([row({ Data_Entrada: "" })]))).toEqual([])
    })
  })

  describe("Criterios_Elegibilidad_ExCateg", () => {
    const row = (o: Partial<CriteriosExCategRow> = {}): CriteriosExCategRow => ({ ExCateg: "99", IdProduto: 5, ...o })
    it("flags a non-integer IdProduto", () => {
      expect(errsOf(validateCriteriosExCateg([row({ IdProduto: 1.2 })])).length).toBeGreaterThan(0)
    })
    it("flags an empty ExCateg", () => {
      expect(errsOf(validateCriteriosExCateg([row({ ExCateg: "" })])).length).toBeGreaterThan(0)
    })
    it("passes for clean rows", () => {
      expect(errsOf(validateCriteriosExCateg([row()]))).toEqual([])
    })
  })
})

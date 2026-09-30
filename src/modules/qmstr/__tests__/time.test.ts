import { describe, expect, it } from "vitest"
import { chileLocalToIso, formatChile, isoToChileLocal, mesAnterior } from "../time"

describe("hora de Chile", () => {
  it("interpreta el instante en America/Santiago con horario de verano (UTC-3)", () => {
    // 29-09-2026: Chile ya está en horario de verano (desde el primer sábado de septiembre)
    expect(chileLocalToIso("2026-09-29T15:45")).toBe("2026-09-29T18:45:00.000Z")
  })

  it("interpreta el instante en horario de invierno (UTC-4)", () => {
    expect(chileLocalToIso("2026-07-15T09:00")).toBe("2026-07-15T13:00:00.000Z")
  })

  it("ida y vuelta con el valor del input", () => {
    expect(isoToChileLocal(chileLocalToIso("2026-09-11T08:00"))).toBe("2026-09-11T08:00")
  })

  it("formatea en hora de Chile", () => {
    expect(formatChile("2026-09-11T11:11:35Z")).toBe("08:11 del 11-09")
  })

  it("rechaza formatos inválidos", () => {
    expect(() => chileLocalToIso("29-09-2026 15:45")).toThrow("instante inválido")
  })

  it("mes anterior, incluido el cambio de año", () => {
    expect(mesAnterior(new Date("2026-09-29T18:00:00Z"))).toBe("202608")
    expect(mesAnterior(new Date("2027-01-10T18:00:00Z"))).toBe("202612")
  })
})

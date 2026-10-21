import { describe, it, expect } from "vitest"
import { duracion } from "@/modules/iteracion/format"

describe("duracion", () => {
  it("segundos bajo el minuto y minutos:segundos desde ahí", () => {
    expect(duracion(59)).toBe("59 s")
    expect(duracion(60)).toBe("1:00 min")
    expect(duracion(106)).toBe("1:46 min")
    expect(duracion(605)).toBe("10:05 min")
  })
})

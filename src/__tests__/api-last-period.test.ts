import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  api,
  getLastCalibration,
  getLastElegibilidad,
  getLastMtr,
  getLastPrices,
  getLastWeighting,
} from "@/lib/api"

// JAA-421: the last-completion endpoints accept an optional period (YYYYMM)
// and forward it as a query param; omitting it must send no params (backward compat).
describe("getLast* period query param", () => {
  let getSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    getSpy = vi.spyOn(api, "get").mockResolvedValue({ data: { countries: {} } })
  })
  afterEach(() => {
    getSpy.mockRestore()
  })

  const cases = [
    { name: "getLastPrices", fn: getLastPrices, path: "/metadata/last-prices" },
    { name: "getLastWeighting", fn: getLastWeighting, path: "/metadata/last-weighting" },
    { name: "getLastMtr", fn: getLastMtr, path: "/metadata/last-mtr" },
    { name: "getLastElegibilidad", fn: getLastElegibilidad, path: "/metadata/last-elegibilidad" },
    { name: "getLastCalibration", fn: getLastCalibration, path: "/metadata/last-calibration" },
  ] as const

  for (const { name, fn, path } of cases) {
    it(`${name} forwards period as a string query param`, async () => {
      await fn(202602)
      expect(getSpy).toHaveBeenCalledWith(path, { params: { period: "202602" } })
    })

    it(`${name} sends no params when period is omitted`, async () => {
      await fn()
      expect(getSpy).toHaveBeenCalledWith(path, undefined)
    })
  }
})

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  api,
  getFormato4Runs,
  getFormato4Run,
  createFormato4Run,
  executeFormato4,
  cancelFormato4,
  getLastFormato4,
} from "@/lib/api"

// MTR-29: the formato4 api fns mirror the MTR lifecycle against the mock-server
// /formato4 routes (MTR-27). These assert each fn targets the right
// path/method/params so the cloned hooks talk to the contract verbatim.
describe("formato4 api fns", () => {
  let getSpy: ReturnType<typeof vi.spyOn>
  let postSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    getSpy = vi.spyOn(api, "get").mockResolvedValue({ data: { items: [], total: 0 } })
    postSpy = vi.spyOn(api, "post").mockResolvedValue({ data: { run_id: "r1" } })
  })
  afterEach(() => {
    getSpy.mockRestore()
    postSpy.mockRestore()
  })

  it("getFormato4Runs GETs /formato4/runs forwarding filters", async () => {
    await getFormato4Runs({ country: "chile", period: 202602 })
    expect(getSpy).toHaveBeenCalledWith("/formato4/runs", {
      params: { country: "chile", period: 202602 },
    })
  })

  it("getFormato4Run GETs /formato4/runs/:id", async () => {
    getSpy.mockResolvedValueOnce({ data: { run_id: "abc" } })
    await getFormato4Run("abc")
    expect(getSpy).toHaveBeenCalledWith("/formato4/runs/abc")
  })

  it("createFormato4Run POSTs /formato4/runs with the body", async () => {
    const body = { country: "chile", period: 202602 }
    await createFormato4Run(body)
    expect(postSpy).toHaveBeenCalledWith("/formato4/runs", body)
  })

  it("executeFormato4 POSTs /formato4/runs/:id/execute", async () => {
    await executeFormato4("abc")
    expect(postSpy).toHaveBeenCalledWith("/formato4/runs/abc/execute")
  })

  it("cancelFormato4 POSTs /formato4/runs/:id/cancel", async () => {
    await cancelFormato4("abc")
    expect(postSpy).toHaveBeenCalledWith("/formato4/runs/abc/cancel")
  })

  describe("getLastFormato4 period query param", () => {
    beforeEach(() => {
      getSpy.mockResolvedValue({ data: { countries: {} } })
    })

    it("forwards period as a string query param", async () => {
      await getLastFormato4(202602)
      expect(getSpy).toHaveBeenCalledWith("/metadata/last-formato4", {
        params: { period: "202602" },
      })
    })

    it("sends no params when period is omitted", async () => {
      await getLastFormato4()
      expect(getSpy).toHaveBeenCalledWith("/metadata/last-formato4", undefined)
    })
  })
})

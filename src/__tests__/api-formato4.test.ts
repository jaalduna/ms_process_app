import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  api,
  getFormato4Runs,
  getFormato4Run,
  createFormato4Run,
  executeFormato4,
  cancelFormato4,
  getLastFormato4,
  downloadFormato4,
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

  // MTR-32: server-generated zip download by runId. Clones the weighting
  // by-runId pattern (downloadWeightingCSV) — a blob GET + anchor-click +
  // revokeObjectURL — NOT the client-side CSV builder (downloadMtrCsv).
  describe("downloadFormato4 (server zip by runId)", () => {
    let createObjectURL: ReturnType<typeof vi.fn>
    let revokeObjectURL: ReturnType<typeof vi.fn>
    let clickSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      createObjectURL = vi.fn(() => "blob:formato4")
      revokeObjectURL = vi.fn()
      // jsdom does not implement the object-URL API
      ;(URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL
      ;(URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL
      clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {})
    })
    afterEach(() => {
      clickSpy.mockRestore()
    })

    it("GETs /formato4/runs/:id/download as a blob and anchor-clicks the server filename", async () => {
      getSpy.mockResolvedValueOnce({
        data: new Blob(["zipbytes"]),
        headers: { "content-disposition": 'attachment; filename="format_4_chile_202602.csv.zip"' },
      })

      await downloadFormato4("run-123", "chile")

      expect(getSpy).toHaveBeenCalledWith("/formato4/runs/run-123/download", {
        responseType: "blob",
      })
      expect(createObjectURL).toHaveBeenCalledTimes(1)
      expect(clickSpy).toHaveBeenCalledTimes(1)
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:formato4")
    })

    it("falls back to a country-named filename when no content-disposition header", async () => {
      const appended: HTMLAnchorElement[] = []
      const appendSpy = vi
        .spyOn(document.body, "appendChild")
        .mockImplementation((node: Node) => {
          appended.push(node as HTMLAnchorElement)
          return node
        })
      getSpy.mockResolvedValueOnce({ data: new Blob(["zipbytes"]), headers: {} })

      await downloadFormato4("run-456", "mexico")

      expect(appended).toHaveLength(1)
      expect(appended[0].download).toBe("format_4_mexico.csv.zip")
      appendSpy.mockRestore()
    })
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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  api,
  getQmsTrRuns,
  getQmsTrRun,
  createQmsTrRun,
  downloadQmsTrTag,
} from "@/lib/api"

// JAA-987: qms_tr has its own job_id/tag contract, distinct from the MTR
// run_id/execute/cancel lifecycle -- these assert each fn targets the right
// path/method/params.
describe("qmstr api fns", () => {
  let getSpy: ReturnType<typeof vi.spyOn>
  let postSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    getSpy = vi.spyOn(api, "get").mockResolvedValue({ data: { items: [], total: 0 } })
    postSpy = vi.spyOn(api, "post").mockResolvedValue({ data: { job_id: "j1" } })
  })
  afterEach(() => {
    getSpy.mockRestore()
    postSpy.mockRestore()
  })

  it("getQmsTrRuns GETs /qms_tr/runs forwarding filters", async () => {
    await getQmsTrRuns({ country: "brasil", ano_base: 2026 })
    expect(getSpy).toHaveBeenCalledWith("/qms_tr/runs", {
      params: { country: "brasil", ano_base: 2026 },
    })
  })

  it("getQmsTrRun GETs /qms_tr/runs/:jobId", async () => {
    getSpy.mockResolvedValueOnce({ data: { job_id: "abc" } })
    await getQmsTrRun("abc")
    expect(getSpy).toHaveBeenCalledWith("/qms_tr/runs/abc")
  })

  it("createQmsTrRun POSTs /qms_tr/runs with the body (no separate execute call)", async () => {
    const body = { country: "brasil", ano_base: 2026 }
    await createQmsTrRun(body)
    expect(postSpy).toHaveBeenCalledWith("/qms_tr/runs", body)
    expect(postSpy).toHaveBeenCalledTimes(1)
  })

  describe("downloadQmsTrTag (server zip by tag)", () => {
    let createObjectURL: ReturnType<typeof vi.fn>
    let revokeObjectURL: ReturnType<typeof vi.fn>
    let clickSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      createObjectURL = vi.fn(() => "blob:qmstr")
      revokeObjectURL = vi.fn()
      ;(URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL
      ;(URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL
      clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {})
    })
    afterEach(() => {
      clickSpy.mockRestore()
    })

    it("GETs /qms_tr/:tag/download as a blob and anchor-clicks the server filename", async () => {
      getSpy.mockResolvedValueOnce({
        data: new Blob(["zipbytes"]),
        headers: { "content-disposition": 'attachment; filename="qms_tr_brasil_2026.zip"' },
      })

      await downloadQmsTrTag("tag-123", "brasil")

      expect(getSpy).toHaveBeenCalledWith("/qms_tr/tag-123/download", {
        params: { country: "brasil" },
        responseType: "blob",
      })
      expect(createObjectURL).toHaveBeenCalledTimes(1)
      expect(clickSpy).toHaveBeenCalledTimes(1)
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:qmstr")
    })

    it("falls back to a tag-named filename when no content-disposition header", async () => {
      const appended: HTMLAnchorElement[] = []
      const appendSpy = vi
        .spyOn(document.body, "appendChild")
        .mockImplementation((node: Node) => {
          appended.push(node as HTMLAnchorElement)
          return node
        })
      getSpy.mockResolvedValueOnce({ data: new Blob(["zipbytes"]), headers: {} })

      await downloadQmsTrTag("tag-456", "brasil")

      expect(appended).toHaveLength(1)
      expect(appended[0].download).toBe("qms_tr_tag-456.zip")
      appendSpy.mockRestore()
    })
  })
})

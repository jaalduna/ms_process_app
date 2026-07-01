import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { api, downloadCalibrationReport, downloadWeightingCSV } from "@/lib/api"

// JAA-757/758: these no longer axios-blob + createObjectURL. They GET a
// signed download-url, then navigate the browser to it natively.
describe("signed-download navigation (JAA-757/758)", () => {
  let getSpy: ReturnType<typeof vi.spyOn>
  let assignSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    assignSpy = vi.fn()
    vi.stubGlobal("location", { ...window.location, assign: assignSpy, origin: "http://localhost:5173" })
  })

  afterEach(() => {
    getSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  it("downloadCalibrationReport requests the signed url then navigates to it", async () => {
    getSpy = vi.spyOn(api, "get").mockResolvedValue({
      data: { url: "/api/v1/calibration/tag1/download-signed?country=chile&token=abc", expires_in: 60 },
    })

    await downloadCalibrationReport("tag1", "chile")

    expect(getSpy).toHaveBeenCalledWith("/calibration/tag1/download-url", { params: { country: "chile" } })
    expect(assignSpy).toHaveBeenCalledTimes(1)
    const [navigatedUrl] = assignSpy.mock.calls[0]
    expect(navigatedUrl).toContain("/api/v1/calibration/tag1/download-signed?country=chile&token=abc")
    expect(navigatedUrl).not.toContain("undefined")
  })

  it("downloadWeightingCSV requests the signed url then navigates to it", async () => {
    getSpy = vi.spyOn(api, "get").mockResolvedValue({
      data: { url: "/api/v1/weighting/runs/run-1/download-signed?token=xyz", expires_in: 60 },
    })

    await downloadWeightingCSV("run-1")

    expect(getSpy).toHaveBeenCalledWith("/weighting/runs/run-1/download-url")
    expect(assignSpy).toHaveBeenCalledTimes(1)
    const [navigatedUrl] = assignSpy.mock.calls[0]
    expect(navigatedUrl).toContain("/api/v1/weighting/runs/run-1/download-signed?token=xyz")
  })

  it("does not use responseType 'blob' for either function", async () => {
    getSpy = vi.spyOn(api, "get").mockResolvedValue({ data: { url: "/api/v1/x", expires_in: 60 } })

    await downloadCalibrationReport("tag1", "chile")
    await downloadWeightingCSV("run-1")

    for (const call of getSpy.mock.calls) {
      const config = call[1] as { responseType?: string } | undefined
      expect(config?.responseType).not.toBe("blob")
    }
  })
})

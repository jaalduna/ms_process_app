import { describe, it, expect, vi, afterEach } from "vitest"
import { api, submitFeedback } from "@/lib/api"
import type { ApiError, FeedbackPayload } from "@/types/api"

// JAA-427: submitFeedback() posts the contract payload to /feedback and
// surfaces 201 (resolves with body) vs 400 (rejects with ApiError).
const payload: FeedbackPayload = {
  message: "me encanta",
  category: "idea",
  contact: "user@example.com",
  context: {
    module: "precios",
    path: "/precios",
    appVersion: "0.3.2",
    user: "dev@localhost",
  },
}

describe("submitFeedback", () => {
  let postSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    postSpy.mockRestore()
  })

  it("posts the contract payload and resolves with the 201 body", async () => {
    const response = { id: "fb_000001", createdAt: "2026-06-18T00:00:00.000Z" }
    postSpy = vi.spyOn(api, "post").mockResolvedValue({ data: response })

    const result = await submitFeedback(payload)

    expect(postSpy).toHaveBeenCalledWith("/feedback", payload)
    expect(result).toEqual(response)
  })

  it("rejects with ApiError when the server returns 400", async () => {
    const apiError: ApiError = { error: "bad_request", message: "message is required" }
    postSpy = vi.spyOn(api, "post").mockRejectedValue(apiError)

    await expect(submitFeedback({ ...payload, message: "" })).rejects.toEqual(apiError)
  })
})

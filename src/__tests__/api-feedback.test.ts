import { describe, it, expect, vi, afterEach } from "vitest"
import { api, submitFeedback, getMyFeedback } from "@/lib/api"
import type { ApiError, FeedbackMineResponse, FeedbackPayload } from "@/types/api"

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
    sessionId: "s-test-session",
  },
}

describe("submitFeedback", () => {
  let postSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    postSpy.mockRestore()
  })

  it("posts the contract payload and resolves with the 201 body", async () => {
    const response = { ticket_number: "FB-000001", status: "todo", created_at: "2026-06-18T00:00:00.000Z" }
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

// JAA-769: getMyFeedback() lists the acting user's own tickets.
describe("getMyFeedback", () => {
  let getSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    getSpy.mockRestore()
  })

  it("calls GET /feedback/mine and resolves with the response data", async () => {
    const response: FeedbackMineResponse = {
      tickets: [
        {
          ticket_number: "FB-000002",
          message: "segundo",
          category: "bug",
          status: "todo",
          created_at: "2026-06-19T00:00:00.000Z",
          updated_at: "2026-06-19T00:00:00.000Z",
        },
        {
          ticket_number: "FB-000001",
          message: "primero",
          category: "idea",
          status: "resuelto",
          created_at: "2026-06-18T00:00:00.000Z",
          updated_at: "2026-06-18T01:00:00.000Z",
        },
      ],
    }
    getSpy = vi.spyOn(api, "get").mockResolvedValue({ data: response })

    const result = await getMyFeedback()

    expect(getSpy).toHaveBeenCalledWith("/feedback/mine")
    expect(result).toEqual(response)
  })
})

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import express from "express"
import feedbackRouter from "../routes/feedback.js"

// JAA-427: the mock-server must honor the POST /feedback contract so the UI can
// be built + e2e-tested without the real backend (parent JAA-426).
describe("POST /feedback (mock-server)", () => {
  let server
  let baseUrl

  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use("/api/v1", feedbackRouter)
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}/api/v1`
        resolve()
      })
    })
  })

  afterAll(() => new Promise((resolve) => server.close(resolve)))

  it("returns 201 { id, createdAt } for a valid body", async () => {
    const res = await fetch(`${baseUrl}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "great app",
        category: "idea",
        context: { module: "precios", path: "/precios", appVersion: "0.3.2" },
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(typeof body.id).toBe("string")
    expect(body.id.length).toBeGreaterThan(0)
    expect(typeof body.createdAt).toBe("string")
    expect(Number.isNaN(Date.parse(body.createdAt))).toBe(false)
  })

  it("returns 400 when message is empty / whitespace", async () => {
    const res = await fetch(`${baseUrl}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "   ", category: "bug" }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("bad_request")
  })

  it("returns 400 when message is missing", async () => {
    const res = await fetch(`${baseUrl}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "otro" }),
    })
    expect(res.status).toBe(400)
  })
})

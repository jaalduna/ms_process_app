import { afterAll, beforeAll, describe, expect, it } from "vitest"
import express from "express"
import eligibilityRouter from "../routes/eligibility.js"
import pricesRouter from "../routes/prices.js"
import weightingRouter from "../routes/weighting.js"
import mtrRouter from "../routes/mtr.js"

// JAA-384 C1: the real backend (FastAPI/Pydantic) types `period` as `int` on the
// /runs create bodies. The mock was untyped JS and accepted a string, so the
// boundary was never exercised and an accidental string-period 422'd only against
// the live API. The mock now rejects a non-integer body period with 422 so e2e
// catches the mismatch. (Query-param filtering on GET /runs stays string-loose —
// HTTP query params are always strings.)
describe("POST /{module}/runs period integer-strictness (mock-server, JAA-384 C1)", () => {
  let server
  let baseUrl

  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use("/api/v1", eligibilityRouter)
    app.use("/api/v1", pricesRouter)
    app.use("/api/v1", weightingRouter)
    app.use("/api/v1", mtrRouter)
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}/api/v1`
        resolve()
      })
    })
  })

  afterAll(() => new Promise((resolve) => server.close(resolve)))

  const post = (path, body) =>
    fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

  const endpoints = ["/eligibility/runs", "/prices/runs", "/weighting/runs", "/mtr/runs"]

  for (const path of endpoints) {
    it(`${path} accepts an integer period (creates the run)`, async () => {
      const res = await post(path, { country: "chile", period: 202602 })
      expect([200, 201]).toContain(res.status)
      const body = await res.json()
      expect(body.period).toBe(202602)
    })

    it(`${path} rejects a string period with 422`, async () => {
      const res = await post(path, { country: "chile", period: "202602" })
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error).toBe("validation_error")
    })

    it(`${path} rejects a non-integer (float) period with 422`, async () => {
      const res = await post(path, { country: "chile", period: 2026.5 })
      expect(res.status).toBe(422)
    })

    it(`${path} still 400s when period is missing`, async () => {
      const res = await post(path, { country: "chile" })
      expect(res.status).toBe(400)
    })
  }
})

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import express from "express"
import formato4Router, { formato4Store, seedFormato4 } from "../routes/formato4.js"

// MTR-27: the mock-server must serve the /formato4 lifecycle (create→execute→
// poll→list→cancel→download) per the MTR-26 contract so the Formato 4 UI clone
// builds + Playwright-tests without the real Bridge API (parent MTR-17).
const FORMATO4_STEPS = ["sync", "merge", "simulate", "format_4", "zip"]

describe("/formato4 routes (mock-server)", () => {
  let server
  let baseUrl

  beforeAll(async () => {
    // Fast steps so polling reaches a terminal state within the test.
    process.env.MOCK_STEP_INTERVAL_MS = "20"
    formato4Store.setDeterministic(true) // never randomly fail mid-poll
    const app = express()
    app.use(express.json())
    app.use("/api/v1", formato4Router)
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}/api/v1`
        resolve()
      })
    })
  })

  afterAll(() => new Promise((resolve) => server.close(resolve)))

  async function createRun(body = { country: "chile", period: 202601 }) {
    const res = await fetch(`${baseUrl}/formato4/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    return res
  }

  // ----- ac1: create -------------------------------------------------------
  it("POST /formato4/runs returns 201 pending with the 5 contract steps", async () => {
    const res = await createRun()
    expect(res.status).toBe(201)
    const run = await res.json()
    expect(run.status).toBe("pending")
    expect(typeof run.run_id).toBe("string")
    expect(run.steps.map((s) => s.name)).toEqual(FORMATO4_STEPS)
    expect(run.steps.every((s) => s.status === "pending")).toBe(true)
    expect(run.results_summary).toBeNull()
  })

  it("POST /formato4/runs returns 400 when country/period missing", async () => {
    const res = await createRun({ period: 202601 })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("bad_request")
  })

  it("POST /formato4/runs returns 422 when period is not an integer", async () => {
    const res = await createRun({ country: "chile", period: "2026-01" })
    expect(res.status).toBe(422)
    expect((await res.json()).error).toBe("validation_error")
  })

  // ----- ac2: execute ------------------------------------------------------
  it("POST /formato4/runs/:id/execute transitions to running", async () => {
    const run = await (await createRun()).json()
    const res = await fetch(`${baseUrl}/formato4/runs/${run.run_id}/execute`, { method: "POST" })
    expect(res.status).toBe(200)
    const executed = await res.json()
    expect(executed.status).toBe("running")
    expect(executed.started_at).not.toBeNull()
  })

  it("POST /formato4/runs/:id/execute returns 404 for unknown id", async () => {
    const res = await fetch(`${baseUrl}/formato4/runs/does-not-exist/execute`, { method: "POST" })
    expect(res.status).toBe(404)
  })

  it("POST /formato4/runs/:id/execute returns 409 when already running", async () => {
    const run = await (await createRun()).json()
    await fetch(`${baseUrl}/formato4/runs/${run.run_id}/execute`, { method: "POST" })
    const res = await fetch(`${baseUrl}/formato4/runs/${run.run_id}/execute`, { method: "POST" })
    expect(res.status).toBe(409)
  })

  // ----- ac3: poll advances to completed -----------------------------------
  it("GET /formato4/runs/:id advances steps over time to completed with results_summary", async () => {
    const run = await (await createRun()).json()
    await fetch(`${baseUrl}/formato4/runs/${run.run_id}/execute`, { method: "POST" })

    let polled
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 25))
      polled = await (await fetch(`${baseUrl}/formato4/runs/${run.run_id}`)).json()
      if (polled.status === "completed") break
    }
    expect(polled.status).toBe("completed")
    expect(polled.steps.every((s) => s.status === "completed")).toBe(true)
    expect(polled.results_summary).not.toBeNull()
    expect(polled.results_summary.country).toBe("chile")
    expect(polled.results_summary.period).toBe(202601)
    expect(typeof polled.results_summary.row_count).toBe("number")
  })

  it("GET /formato4/runs/:id returns 404 for unknown id", async () => {
    const res = await fetch(`${baseUrl}/formato4/runs/nope`)
    expect(res.status).toBe(404)
  })

  // ----- ac4: list ---------------------------------------------------------
  it("GET /formato4/runs returns paginated list filtered by country/period", async () => {
    await createRun({ country: "colombia", period: 202605 })
    const res = await fetch(`${baseUrl}/formato4/runs?country=colombia&period=202605`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.items)).toBe(true)
    expect(typeof body.total).toBe("number")
    expect(body).toHaveProperty("limit")
    expect(body).toHaveProperty("offset")
    expect(body.items.every((r) => r.country === "colombia" && String(r.period) === "202605")).toBe(true)
  })

  // ----- ac5: cancel -------------------------------------------------------
  it("POST /formato4/runs/:id/cancel cancels a running run", async () => {
    const run = await (await createRun()).json()
    await fetch(`${baseUrl}/formato4/runs/${run.run_id}/execute`, { method: "POST" })
    const res = await fetch(`${baseUrl}/formato4/runs/${run.run_id}/cancel`, { method: "POST" })
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe("cancelled")
  })

  it("POST /formato4/runs/:id/cancel returns 409 on a terminal run", async () => {
    const run = await (await createRun()).json()
    await fetch(`${baseUrl}/formato4/runs/${run.run_id}/execute`, { method: "POST" })
    await fetch(`${baseUrl}/formato4/runs/${run.run_id}/cancel`, { method: "POST" })
    const res = await fetch(`${baseUrl}/formato4/runs/${run.run_id}/cancel`, { method: "POST" })
    expect(res.status).toBe(409)
  })

  it("POST /formato4/runs/:id/cancel returns 404 for unknown id", async () => {
    const res = await fetch(`${baseUrl}/formato4/runs/ghost/cancel`, { method: "POST" })
    expect(res.status).toBe(404)
  })

  // ----- ac6: download zip -------------------------------------------------
  it("GET /formato4/runs/:id/download streams a real zip with Content-Disposition for a completed run", async () => {
    // Seeded runs are completed.
    seedFormato4()
    const list = await (await fetch(`${baseUrl}/formato4/runs?status=completed&country=chile`)).json()
    expect(list.items.length).toBeGreaterThan(0)
    const completed = list.items[0]

    const res = await fetch(`${baseUrl}/formato4/runs/${completed.run_id}/download`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/zip")
    expect(res.headers.get("content-disposition")).toBe(
      `attachment; filename="format_4_${completed.country}_${completed.period}.csv.zip"`,
    )
    const buf = Buffer.from(await res.arrayBuffer())
    // Valid zip → starts with the local-file-header magic "PK\x03\x04".
    expect(buf.length).toBeGreaterThan(0)
    expect(buf[0]).toBe(0x50) // P
    expect(buf[1]).toBe(0x4b) // K
  })

  it("GET /formato4/runs/:id/download returns 409 when run is not completed", async () => {
    const run = await (await createRun()).json()
    const res = await fetch(`${baseUrl}/formato4/runs/${run.run_id}/download`)
    expect(res.status).toBe(409)
  })

  it("GET /formato4/runs/:id/download returns 404 for unknown id", async () => {
    const res = await fetch(`${baseUrl}/formato4/runs/missing/download`)
    expect(res.status).toBe(404)
  })
})

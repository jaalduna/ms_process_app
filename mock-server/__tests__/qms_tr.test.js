import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import express from "express"
import qmsTrRouter, { resetQmsTrJobs } from "../routes/qms_tr.js"

// JAA-986: QMS-TR mock route, modeled on sync.js's job_id/steps/download
// pattern (NOT mtr.js's run_id/RunStore pattern) so the future frontend can
// be built against the same job_id-shaped contract sync.js already exposes.
describe("QMS-TR API (mock-server, JAA-986)", () => {
  let server
  let baseUrl
  const ORIG_INTERVAL = process.env.MOCK_STEP_INTERVAL_MS

  beforeAll(async () => {
    process.env.MOCK_STEP_INTERVAL_MS = "20"
    const app = express()
    app.use(express.json())
    app.use("/api/v1", qmsTrRouter)
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}/api/v1`
        resolve()
      })
    })
  })

  afterEach(() => {
    resetQmsTrJobs()
  })

  afterAll(async () => {
    if (ORIG_INTERVAL === undefined) delete process.env.MOCK_STEP_INTERVAL_MS
    else process.env.MOCK_STEP_INTERVAL_MS = ORIG_INTERVAL
    await new Promise((resolve) => server.close(resolve))
  })

  async function waitForStatus(jobId, statuses, { timeoutMs = 3000, intervalMs = 15 } = {}) {
    const deadline = Date.now() + timeoutMs
    let last
    while (Date.now() < deadline) {
      const res = await fetch(`${baseUrl}/qms_tr/runs/${jobId}`)
      last = await res.json()
      if (statuses.includes(last.status)) return last
      await new Promise((r) => setTimeout(r, intervalMs))
    }
    throw new Error(`Timed out waiting for status in [${statuses}], last=${JSON.stringify(last)}`)
  }

  it("ac1: POST /qms_tr/runs creates a run for a country + ano_base with a synthetic job_id and step scaffold", async () => {
    const res = await fetch(`${baseUrl}/qms_tr/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country: "brasil", ano_base: 2025 }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.job_id).toBeTruthy()
    expect(body.country).toBe("brasil")
    expect(body.ano_base).toBe(2025)
    expect(body.steps.map((s) => s.name)).toEqual([
      "run_sync", "run_bronze_copy", "silver_builder", "kpis_batch", "export_zip",
    ])
  })

  // ------------------------------------------------------------------- JAA-1003 skip_sync
  it("JAA-1003: skip_sync defaults to true, and run_sync is immediately 'cancelled' (skipped)", async () => {
    const res = await fetch(`${baseUrl}/qms_tr/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country: "brasil", ano_base: 2025 }),
    })
    const body = await res.json()
    expect(body.skip_sync).toBe(true)
    const runSync = body.steps.find((s) => s.name === "run_sync")
    expect(runSync.status).toBe("cancelled")
    const bronzeCopy = body.steps.find((s) => s.name === "run_bronze_copy")
    expect(bronzeCopy.status).toBe("running")
  })

  it("JAA-1003: skip_sync=false runs run_sync normally instead of skipping it", async () => {
    const res = await fetch(`${baseUrl}/qms_tr/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country: "brasil", ano_base: 2025, skip_sync: false }),
    })
    const body = await res.json()
    expect(body.skip_sync).toBe(false)
    const runSync = body.steps.find((s) => s.name === "run_sync")
    expect(runSync.status).toBe("running")
    const bronzeCopy = body.steps.find((s) => s.name === "run_bronze_copy")
    expect(bronzeCopy.status).toBe("pending")
  })

  it("JAA-1003: skip_sync=false still reaches completed with run_sync marked completed (not cancelled)", async () => {
    const createRes = await fetch(`${baseUrl}/qms_tr/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country: "brasil", ano_base: 2025, skip_sync: false, force_outcome: "pass" }),
    })
    const { job_id } = await createRes.json()

    const final = await waitForStatus(job_id, ["completed"])
    const runSync = final.steps.find((s) => s.name === "run_sync")
    expect(runSync.status).toBe("completed")
  })

  it("POST /qms_tr/runs 400s when country or ano_base is missing", async () => {
    const res = await fetch(`${baseUrl}/qms_tr/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country: "brasil" }),
    })
    expect(res.status).toBe(400)
  })

  it("ac2: GET /qms_tr/runs/{id} advances steps over time until completed", async () => {
    const createRes = await fetch(`${baseUrl}/qms_tr/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country: "brasil", ano_base: 2025, force_outcome: "pass" }),
    })
    const { job_id } = await createRes.json()

    const final = await waitForStatus(job_id, ["completed"])
    // run_sync stays "cancelled" (skip_sync defaults true) even on overall
    // pipeline completion; every other step reaches "completed".
    expect(final.steps.map((s) => s.status)).toEqual(["cancelled", "completed", "completed", "completed", "completed"])
    expect(final.current_step).toBeNull()
  })

  it("ac3: download 409s before completion and 200s with an attachment after", async () => {
    const createRes = await fetch(`${baseUrl}/qms_tr/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country: "brasil", ano_base: 2025, force_outcome: "pass" }),
    })
    const { job_id, tag } = await createRes.json()

    const earlyRes = await fetch(`${baseUrl}/qms_tr/${job_id}/download`)
    expect(earlyRes.status).toBe(409)

    await waitForStatus(job_id, ["completed"])

    const byId = await fetch(`${baseUrl}/qms_tr/${job_id}/download`)
    expect(byId.status).toBe(200)
    expect(byId.headers.get("content-disposition")).toMatch(/attachment/)

    const byTag = await fetch(`${baseUrl}/qms_tr/${tag}/download`)
    expect(byTag.status).toBe(200)
  })

  it("ac4: GET /qms_tr/runs?country=... filters the list/history", async () => {
    await fetch(`${baseUrl}/qms_tr/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country: "brasil", ano_base: 2025 }),
    })
    await fetch(`${baseUrl}/qms_tr/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country: "chile", ano_base: 2025 }),
    })

    const res = await fetch(`${baseUrl}/qms_tr/runs?country=brasil`)
    const body = await res.json()
    expect(body.items.length).toBeGreaterThan(0)
    expect(body.items.every((j) => j.country === "brasil")).toBe(true)
  })

  it("ac5: force_outcome=fail deterministically fails a step and surfaces the error", async () => {
    const createRes = await fetch(`${baseUrl}/qms_tr/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country: "brasil", ano_base: 2025, force_outcome: "fail" }),
    })
    const { job_id } = await createRes.json()

    const final = await waitForStatus(job_id, ["failed"])
    expect(final.error_message).toBeTruthy()
    expect(final.steps.some((s) => s.status === "failed")).toBe(true)
  })

  it("GET /qms_tr/runs/{id} 404s for an unknown id", async () => {
    const res = await fetch(`${baseUrl}/qms_tr/runs/does-not-exist`)
    expect(res.status).toBe(404)
  })
})

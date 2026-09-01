import { afterAll, beforeAll, describe, expect, it } from "vitest"
import express from "express"
import snapshotsRouter, { PESAJE_SNAPSHOTS, ELEGIBILIDAD_SNAPSHOTS } from "../routes/snapshots.js"
import weightingRouter, { weightingStore } from "../routes/weighting.js"
import eligibilityRouter, { eligibilityStore } from "../routes/eligibility.js"

let server
let baseUrl
let rootUrl

beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use("/api/v1", snapshotsRouter)
  app.use("/api/v1", weightingRouter)
  app.use("/api/v1", eligibilityRouter)
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      rootUrl = `http://localhost:${server.address().port}`
      baseUrl = `${rootUrl}/api/v1`
      resolve()
    })
  })
})

afterAll(() => new Promise((resolve) => server.close(resolve)))

async function waitFor(fn, { timeoutMs = 3000, intervalMs = 20 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const result = await fn()
    if (result) return result
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error("waitFor: timed out")
}

describe("GET /snapshots/:process (JAA-1179/JAA-1183)", () => {
  it("returns pesaje fixtures filtered by country", async () => {
    const resp = await fetch(`${baseUrl}/snapshots/pesaje?country=bolivia`)
    expect(resp.status).toBe(200)
    const { items } = await resp.json()
    expect(items.length).toBe(2)
    expect(items.every((v) => v.country === "bolivia")).toBe(true)
    expect(items[0].tables.map((t) => t.table)).toEqual(
      expect.arrayContaining(["mordom", "rg_domicilios_pesos", "rg_panelis"]),
    )
  })

  it("returns elegibilidad fixtures filtered by country", async () => {
    const resp = await fetch(`${baseUrl}/snapshots/elegibilidad?country=brasil`)
    expect(resp.status).toBe(200)
    const { items } = await resp.json()
    expect(items.length).toBe(1)
    expect(items[0].country).toBe("brasil")
    expect(items[0].tables.map((t) => t.table)).toEqual(
      expect.arrayContaining(["j_atoscompra_new_full", "mordom_full"]),
    )
  })

  it("returns calibracion fixtures (same data as /calibration/j-versions)", async () => {
    const resp = await fetch(`${baseUrl}/snapshots/calibracion?country=chile`)
    expect(resp.status).toBe(200)
    const { items } = await resp.json()
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((v) => v.country === "chile")).toBe(true)
  })

  it("404s for an unknown process", async () => {
    const resp = await fetch(`${baseUrl}/snapshots/unknown`)
    expect(resp.status).toBe(404)
  })
})

describe("weighting execute with j_source (JAA-1179/JAA-1183)", () => {
  beforeAll(() => weightingStore.setDeterministic(true))

  it("defaults to sync and registers a generated snapshot tag on completion", async () => {
    process.env.MOCK_STEP_INTERVAL_MS = "10"
    const run = weightingStore.create("bolivia", 202606, ["load_eligible", "calculate_weights", "validate_distributions", "export_results", "complete"], {}, {})

    const resp = await fetch(`${baseUrl}/weighting/runs/${run.run_id}/execute`, { method: "POST" })
    expect(resp.status).toBe(200)
    const started = await resp.json()
    expect(started.j_source).toBe("sync")

    const completed = await waitFor(() => {
      const r = weightingStore.get(run.run_id)
      return r.status === "completed" ? r : null
    })
    expect(completed.snapshot_tag).toMatch(/^bolivia-202606-[0-9a-f]{8}$/)
    expect(PESAJE_SNAPSHOTS.some((v) => v.tag === completed.snapshot_tag)).toBe(true)
    delete process.env.MOCK_STEP_INTERVAL_MS
  })

  it("uses the given tag as snapshot_tag when j_source is a saved version", async () => {
    process.env.MOCK_STEP_INTERVAL_MS = "10"
    const run = weightingStore.create("bolivia", 202607, ["load_eligible", "calculate_weights", "validate_distributions", "export_results", "complete"], {}, {})

    const resp = await fetch(`${baseUrl}/weighting/runs/${run.run_id}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ j_source: "bolivia-202605-1a2b3c4d" }),
    })
    const started = await resp.json()
    expect(started.j_source).toBe("bolivia-202605-1a2b3c4d")

    const completed = await waitFor(() => {
      const r = weightingStore.get(run.run_id)
      return r.status === "completed" ? r : null
    })
    expect(completed.snapshot_tag).toBe("bolivia-202605-1a2b3c4d")
    delete process.env.MOCK_STEP_INTERVAL_MS
  })
})

describe("eligibility execute with j_source + zip download (JAA-1179/JAA-1183/JAA-1184)", () => {
  beforeAll(() => eligibilityStore.setDeterministic(true))

  it("registers a snapshot tag once results_ready and allows the zip download", async () => {
    const run = eligibilityStore.create("brasil", 202606, {})

    const resp = await fetch(`${baseUrl}/eligibility/runs/${run.run_id}/execute`, { method: "POST" })
    expect(resp.status).toBe(200)
    const body = await resp.json()
    expect(body.status).toBe("results_ready")
    expect(body.j_source).toBe("sync")
    expect(body.snapshot_tag).toMatch(/^brasil-202606-[0-9a-f]{8}$/)
    expect(ELEGIBILIDAD_SNAPSHOTS.some((v) => v.tag === body.snapshot_tag)).toBe(true)

    const issued = await fetch(`${baseUrl}/eligibility/runs/${run.run_id}/download-url`)
    expect(issued.status).toBe(200)
    const { url } = await issued.json()
    const zipResp = await fetch(`${rootUrl}${url}`)
    expect(zipResp.status).toBe(200)
    expect(zipResp.headers.get("content-type")).toBe("application/zip")
  })

  it("409s the download before results_ready", async () => {
    const run = eligibilityStore.create("brasil", 202608, {})
    const resp = await fetch(`${baseUrl}/eligibility/runs/${run.run_id}/download-url`)
    expect(resp.status).toBe(409)
  })
})

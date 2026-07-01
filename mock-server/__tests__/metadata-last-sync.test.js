import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import express from "express"
import metadataRouter from "../routes/metadata.js"
import { jobs, resetJobs } from "../routes/sync.js"

// JAA-384 C2: the frontend calls /metadata/last-sync with stage=pesaje (+ optional
// min_queries) — the mock used to hardcode stage "inicio" and ignore both params,
// so the per-country "Sync:" date on the Calibracion cards reflected the wrong
// stage in dev. The handler must honor the stage query param (defaulting to
// "inicio" when absent) and the min_queries filter.
describe("GET /metadata/last-sync honors stage + min_queries (mock-server, JAA-384 C2)", () => {
  let server
  let baseUrl

  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use("/api/v1", metadataRouter)
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}/api/v1`
        resolve()
      })
    })
  })

  afterAll(() => new Promise((resolve) => server.close(resolve)))

  beforeEach(() => resetJobs())

  const seedJob = (job) => jobs.set(job.job_id, { status: "completed", completed_at: "2026-05-01T00:00:00.000Z", queries_total: 6, ...job })

  const get = (qs) => fetch(`${baseUrl}/metadata/last-sync${qs}`).then((r) => r.json())

  it("returns the job of the requested stage (stage=pesaje), not the hardcoded 'inicio'", async () => {
    seedJob({ job_id: "i1", country: "chile", stage: "inicio" })
    seedJob({ job_id: "p1", country: "chile", stage: "pesaje" })
    const { countries } = await get("?stage=pesaje")
    expect(countries.chile).toBeDefined()
    expect(countries.chile.run_id).toBe("p1")
  })

  it("defaults to stage 'inicio' when no stage param is given", async () => {
    seedJob({ job_id: "i1", country: "chile", stage: "inicio" })
    seedJob({ job_id: "p1", country: "chile", stage: "pesaje" })
    const { countries } = await get("")
    expect(countries.chile.run_id).toBe("i1")
  })

  it("min_queries excludes jobs whose queries_total is below the threshold", async () => {
    seedJob({ job_id: "small", country: "bolivia", stage: "pesaje", queries_total: 3 })
    seedJob({ job_id: "big", country: "chile", stage: "pesaje", queries_total: 6 })
    const { countries } = await get("?stage=pesaje&min_queries=5")
    expect(countries.bolivia).toBeUndefined()
    expect(countries.chile.run_id).toBe("big")
  })
})

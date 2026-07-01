import { afterAll, beforeAll, describe, expect, it } from "vitest"
import express from "express"
import weightingRouter, { weightingStore } from "../routes/weighting.js"
import syncRouter, { jobs } from "../routes/sync.js"

// JAA-755: mark a run as "final" for its (country, period) scope — exclusive,
// one final run at a time — plus a free-text label, independent of is_final.
describe("PATCH /weighting/runs/:runId (JAA-755)", () => {
  let server
  let baseUrl

  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use("/api/v1", weightingRouter)
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}/api/v1`
        resolve()
      })
    })
  })

  afterAll(() => new Promise((resolve) => server.close(resolve)))

  const patch = (runId, body) =>
    fetch(`${baseUrl}/weighting/runs/${runId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

  it("sets label freely without touching is_final", async () => {
    const run = weightingStore.create("chile", 202605, ["step1"])
    const res = await patch(run.run_id, { label: "aprobada por X" })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.label).toBe("aprobada por X")
    expect(body.is_final).toBeFalsy()
  })

  it("marking a run final unsets is_final on siblings sharing country+period", async () => {
    const runA = weightingStore.create("bolivia", 202605, ["step1"])
    const runB = weightingStore.create("bolivia", 202605, ["step1"])

    let res = await patch(runA.run_id, { is_final: true })
    expect((await res.json()).is_final).toBe(true)

    res = await patch(runB.run_id, { is_final: true })
    const bodyB = await res.json()
    expect(bodyB.is_final).toBe(true)
    expect(weightingStore.get(runA.run_id).is_final).toBe(false)
  })

  it("does not affect exclusivity across a different country/period", async () => {
    const runA = weightingStore.create("peru", 202605, ["step1"])
    const runOther = weightingStore.create("peru", 202606, ["step1"])

    await patch(runA.run_id, { is_final: true })
    await patch(runOther.run_id, { is_final: true })

    expect(weightingStore.get(runA.run_id).is_final).toBe(true)
    expect(weightingStore.get(runOther.run_id).is_final).toBe(true)
  })

  it("404s on an unknown runId", async () => {
    const res = await patch("does-not-exist", { is_final: true })
    expect(res.status).toBe(404)
  })
})

describe("PATCH /events/:jobId (JAA-755, calibration)", () => {
  let server
  let baseUrl

  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use("/api/v1", syncRouter)
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}/api/v1`
        resolve()
      })
    })
  })

  afterAll(() => new Promise((resolve) => server.close(resolve)))

  const patch = (jobId, body) =>
    fetch(`${baseUrl}/events/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

  const seedJob = (jobId, country, stage, period) => {
    jobs.set(jobId, {
      job_id: jobId,
      status: "completed",
      country,
      stage,
      period,
      tag: `${country}-${stage}-${jobId}`,
      queries_total: 1,
      queries_completed: 1,
      queries_failed: 0,
      created_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      triggered_by: "test",
      error: null,
      results: [],
      steps: [],
      current_step: null,
    })
  }

  it("sets label freely without touching is_final", async () => {
    seedJob("job-label-1", "chile", "calibracion", "202605")
    const res = await patch("job-label-1", { label: "override Y" })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.label).toBe("override Y")
    expect(body.is_final).toBeFalsy()
  })

  it("marking a job final unsets is_final on siblings sharing country+stage+period", async () => {
    seedJob("job-final-a", "bolivia", "calibracion", "202605")
    seedJob("job-final-b", "bolivia", "calibracion", "202605")

    let res = await patch("job-final-a", { is_final: true })
    expect((await res.json()).is_final).toBe(true)

    res = await patch("job-final-b", { is_final: true })
    const bodyB = await res.json()
    expect(bodyB.is_final).toBe(true)
    expect(jobs.get("job-final-a").is_final).toBe(false)
  })

  it("does not affect exclusivity across a different period", async () => {
    seedJob("job-other-a", "peru", "calibracion", "202605")
    seedJob("job-other-b", "peru", "calibracion", "202606")

    await patch("job-other-a", { is_final: true })
    await patch("job-other-b", { is_final: true })

    expect(jobs.get("job-other-a").is_final).toBe(true)
    expect(jobs.get("job-other-b").is_final).toBe(true)
  })

  it("404s on an unknown jobId", async () => {
    const res = await patch("does-not-exist", { is_final: true })
    expect(res.status).toBe(404)
  })
})

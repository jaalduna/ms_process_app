import { afterAll, beforeAll, describe, expect, it } from "vitest"
import express from "express"
import syncRouter from "../routes/sync.js"

// JAA-384 C4: the frontend's TriggerRequest sends 6 fields the mock used to drop
// (table_suffix, group_by, start_period, final_period, skip_merge, skip_simulation).
// The backend supports them, so the mock must at least reflect them in job state
// — otherwise those code paths go unvalidated in dev.
describe("POST /trigger reflects the extra request fields (mock-server, JAA-384 C4)", () => {
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

  it("stores the 6 extra fields on the job (observable via GET /events/{id})", async () => {
    const extra = {
      table_suffix: "_v2",
      group_by: "region",
      start_period: "202601",
      final_period: "202603",
      skip_merge: true,
      skip_simulation: true,
    }
    const triggerRes = await fetch(`${baseUrl}/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country: "chile", stage: "calibracion", period: "202603", ...extra }),
    })
    expect(triggerRes.status).toBe(201)
    const { job_id } = await triggerRes.json()

    const eventRes = await fetch(`${baseUrl}/events/${job_id}`)
    expect(eventRes.status).toBe(200)
    const job = await eventRes.json()
    expect(job.table_suffix).toBe("_v2")
    expect(job.group_by).toBe("region")
    expect(job.start_period).toBe("202601")
    expect(job.final_period).toBe("202603")
    expect(job.skip_merge).toBe(true)
    expect(job.skip_simulation).toBe(true)

    // Stop the auto-advance interval so the test process doesn't linger.
    await fetch(`${baseUrl}/events/${job_id}/cancel`, { method: "POST" })
  })
})

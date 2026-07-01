import { afterAll, beforeAll, describe, expect, it } from "vitest"
import express from "express"
import calibrationRouter from "../routes/calibration.js"
import weightingRouter, { weightingStore } from "../routes/weighting.js"
import { jobs } from "../routes/sync.js"

let server
let baseUrl
let rootUrl

beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use("/api/v1", calibrationRouter)
  app.use("/api/v1", weightingRouter)
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      rootUrl = `http://localhost:${server.address().port}`
      baseUrl = `${rootUrl}/api/v1`
      resolve()
    })
  })
})

afterAll(() => new Promise((resolve) => server.close(resolve)))

describe("calibration signed download (JAA-757/758 contract)", () => {
  const tag = "signed-test-tag"
  const country = "chile"

  beforeAll(() => {
    jobs.set("job-signed-test", {
      id: "job-signed-test", tag, country, stage: "calibracion", period: 202602, results: [],
    })
  })

  it("issues a download-url then streams via download-signed", async () => {
    const issued = await fetch(`${baseUrl}/calibration/${tag}/download-url?country=${country}`)
    expect(issued.status).toBe(200)
    const body = await issued.json()
    expect(body.url).toContain("token=")
    expect(body.expires_in).toBeGreaterThan(0)

    const resp = await fetch(`${rootUrl}${body.url}`)
    expect(resp.status).toBe(200)
    expect(resp.headers.get("content-type")).toBe("application/zip")
  })

  it("rejects download-signed with no token", async () => {
    const resp = await fetch(`${baseUrl}/calibration/${tag}/download-signed?country=${country}`)
    expect(resp.status).toBe(401)
  })

  it("rejects a token issued for a different tag", async () => {
    jobs.set("job-signed-test-2", {
      id: "job-signed-test-2", tag: "other-tag", country, stage: "calibracion", period: 202602, results: [],
    })
    const issued = await fetch(`${baseUrl}/calibration/other-tag/download-url?country=${country}`)
    const { url } = await issued.json()
    const token = new URL(`${rootUrl}${url}`).searchParams.get("token")

    const resp = await fetch(`${baseUrl}/calibration/${tag}/download-signed?country=${country}&token=${token}`)
    expect(resp.status).toBe(403)
  })
})

describe("weighting signed download (JAA-757/758 contract)", () => {
  it("issues a download-url then streams via download-signed", async () => {
    const run = weightingStore.create("chile", 202602, ["a"], {}, { summary_stats: { total_households: 5, weighted_households: 5, min_weight: 1, max_weight: 2, mean_weight: 1.5, median_weight: 1.5, std_dev: 0.1 } })
    run.status = "completed"

    const issued = await fetch(`${baseUrl}/weighting/runs/${run.run_id}/download-url`)
    expect(issued.status).toBe(200)
    const { url, expires_in: expiresIn } = await issued.json()
    expect(expiresIn).toBeGreaterThan(0)

    const resp = await fetch(`${rootUrl}${url}`)
    expect(resp.status).toBe(200)
    expect(resp.headers.get("content-type")).toContain("text/csv")
  })

  it("rejects a token issued for a different run", async () => {
    const runA = weightingStore.create("chile", 202603, ["a"], {}, { summary_stats: null })
    runA.status = "completed"
    const runB = weightingStore.create("chile", 202604, ["a"], {}, { summary_stats: null })
    runB.status = "completed"

    const issued = await fetch(`${baseUrl}/weighting/runs/${runA.run_id}/download-url`)
    const { url } = await issued.json()
    const token = new URL(`${rootUrl}${url}`).searchParams.get("token")

    const resp = await fetch(`${baseUrl}/weighting/runs/${runB.run_id}/download-signed?token=${token}`)
    expect(resp.status).toBe(403)
  })

  it("rejects download-signed with no token", async () => {
    const run = weightingStore.create("chile", 202605, ["a"], {}, { summary_stats: null })
    run.status = "completed"
    const resp = await fetch(`${baseUrl}/weighting/runs/${run.run_id}/download-signed`)
    expect(resp.status).toBe(401)
  })
})

import express from "express"
import cors from "cors"

import syncRouter, { jobs } from "./routes/sync.js"
import metadataRouter from "./routes/metadata.js"
import pricesRouter, { pricesStore } from "./routes/prices.js"
import weightingRouter, { weightingStore } from "./routes/weighting.js"
import mtrRouter, { mtrStore } from "./routes/mtr.js"
import traceabilityRouter from "./routes/traceability.js"
import testRouter from "./routes/test.js"
import { seedAll } from "./fixtures/seed.js"

const app = express()
app.use(cors())
app.use(express.json())

const PORT = 5000

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

app.get("/health/live", (_req, res) => res.json({ status: "ok" }))

// Auth me (always mocked)
app.get("/api/v1/auth/me", (_req, res) => {
  res.json({ email: "dev@localhost", name: "Dev User", roles: ["admin"], countries: ["*"] })
})

// ---------------------------------------------------------------------------
// Mount route modules
// ---------------------------------------------------------------------------

// Last-completion metadata (registered before metadataRouter so they take precedence)
app.get("/api/v1/metadata/last-prices", (_req, res) => res.json({ countries: pricesStore.lastCompleted() }))
app.get("/api/v1/metadata/last-weighting", (_req, res) => res.json({ countries: weightingStore.lastCompleted() }))
app.get("/api/v1/metadata/last-mtr", (_req, res) => res.json({ countries: mtrStore.lastCompleted() }))

app.use("/api/v1", syncRouter)
app.use("/api/v1", metadataRouter)
app.use("/api/v1", pricesRouter)
app.use("/api/v1", weightingRouter)
app.use("/api/v1", mtrRouter)
app.use("/api/v1", traceabilityRouter)
app.use("/api/v1", testRouter)

// ---------------------------------------------------------------------------
// Seed and start
// ---------------------------------------------------------------------------

seedAll()

app.listen(PORT, () => {
  console.log(`Mock sql-databricks-bridge running on http://localhost:${PORT}`)
  console.log(`  GET  /health/live`)
  console.log(`  GET  /api/v1/auth/me`)
  console.log(`  GET  /api/v1/metadata/countries`)
  console.log(`  GET  /api/v1/metadata/data-availability?period=202602`)
  console.log(`  POST /api/v1/trigger`)
  console.log(`  GET  /api/v1/events`)
  console.log(`  ---  Prices: /api/v1/prices/runs`)
  console.log(`  ---  Weighting: /api/v1/weighting/runs`)
  console.log(`  ---  MTR: /api/v1/mtr/runs`)
  console.log(`  ---  Traceability: /api/v1/traceability/tags`)
  console.log(`  POST /api/v1/test/reset`)
  console.log(`\nPre-seeded ${jobs.size} sync jobs, ${pricesStore.runs.size} prices runs, ${weightingStore.runs.size} weighting runs, ${mtrStore.runs.size} mtr runs`)
})

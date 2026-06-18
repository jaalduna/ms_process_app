import express from "express"
import cors from "cors"

import syncRouter, { jobs } from "./routes/sync.js"
import metadataRouter from "./routes/metadata.js"
import pricesRouter, { pricesStore } from "./routes/prices.js"
import weightingRouter, { weightingStore } from "./routes/weighting.js"
import mtrRouter, { mtrStore } from "./routes/mtr.js"
import eligibilityRouter, { eligibilityStore } from "./routes/eligibility.js"
import processesRouter from "./routes/processes.js"
import traceabilityRouter from "./routes/traceability.js"
import calibrationRouter from "./routes/calibration.js"
import testRouter from "./routes/test.js"
import authRouter, { verifyAppToken } from "./routes/auth.js"
import adminRouter from "./routes/admin.js"
import telemetryRouter from "./routes/telemetry.js"
import feedbackRouter from "./routes/feedback.js"
import { seedAll } from "./fixtures/seed.js"

const app = express()
app.use(cors())
app.use(express.json())

const PORT = Number(process.env.PORT) || 5000

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

app.get("/health/live", (_req, res) => res.json({ status: "ok" }))

// ---------------------------------------------------------------------------
// GitHub OAuth endpoints (browser-accessible, not versioned)
// GET /auth/github          → redirect to GitHub authorization
// GET /auth/github/callback → process callback, issue JWT, redirect to frontend
// ---------------------------------------------------------------------------

app.use(authRouter)

// ---------------------------------------------------------------------------
// Auth me — validate JWT if present, fall back to mock for dev bypass
// ---------------------------------------------------------------------------

app.get("/api/v1/auth/me", (req, res) => {
  const authHeader = req.headers.authorization ?? ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null

  if (token && token !== "dev-bypass-token") {
    const claims = verifyAppToken(token)
    if (claims) {
      return res.json({
        email: claims.email,
        name: claims.name,
        roles: claims.roles,
        countries: claims.countries,
      })
    }
    return res.status(401).json({ error: "invalid_token", message: "JWT verification failed" })
  }

  // Dev bypass / no token — return mock user
  res.json({ email: "dev@localhost", name: "Dev User", roles: ["admin"], countries: ["*"] })
})

// ---------------------------------------------------------------------------
// Mount route modules
// ---------------------------------------------------------------------------

// Last-completion metadata (registered before metadataRouter so they take precedence)
app.get("/api/v1/metadata/last-prices", (req, res) => res.json({ countries: pricesStore.lastCompleted(req.query.period) }))
app.get("/api/v1/metadata/last-weighting", (req, res) => res.json({ countries: weightingStore.lastCompleted(req.query.period) }))
app.get("/api/v1/metadata/last-mtr", (req, res) => res.json({ countries: mtrStore.lastCompleted(req.query.period) }))

app.use("/api/v1", syncRouter)
app.use("/api/v1", metadataRouter)
app.use("/api/v1", pricesRouter)
app.use("/api/v1", weightingRouter)
app.use("/api/v1", mtrRouter)
app.use("/api/v1", eligibilityRouter)
app.use("/api/v1", processesRouter)
app.use("/api/v1", traceabilityRouter)
app.use("/api/v1", calibrationRouter)
app.use("/api/v1", testRouter)
app.use("/api/v1", adminRouter)
app.use("/api/v1", telemetryRouter)
app.use("/api/v1", feedbackRouter)

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
  console.log(`  ---  Eligibility: /api/v1/eligibility/runs`)
  console.log(`  ---  Traceability: /api/v1/tags`)
  console.log(`  ---  Calibration download: /api/v1/calibration/:tag/download`)
  console.log(`  GET  /api/v1/events/:jobId/tables`)
  console.log(`  POST /api/v1/test/reset`)
  console.log(`\nPre-seeded ${jobs.size} sync jobs, ${pricesStore.runs.size} prices runs, ${weightingStore.runs.size} weighting runs, ${mtrStore.runs.size} mtr runs, ${eligibilityStore.runs.size} eligibility runs`)
})

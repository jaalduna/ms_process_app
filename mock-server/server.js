import express from "express"
import cors from "cors"
import path from "path"

import syncRouter, { jobs } from "./routes/sync.js"
import metadataRouter from "./routes/metadata.js"
import pricesRouter, { pricesStore } from "./routes/prices.js"
import weightingRouter, { weightingStore } from "./routes/weighting.js"
import mtrRouter, { mtrStore } from "./routes/mtr.js"
import qmsTrRouter from "./routes/qms_tr.js"
import formato4Router, { formato4Store } from "./routes/formato4.js"
import eligibilityRouter, { eligibilityStore } from "./routes/eligibility.js"
import processesRouter from "./routes/processes.js"
import traceabilityRouter from "./routes/traceability.js"
import calibrationRouter from "./routes/calibration.js"
import testRouter from "./routes/test.js"
import authRouter, { verifyAppToken } from "./routes/auth.js"
import adminRouter from "./routes/admin.js"
import telemetryRouter from "./routes/telemetry.js"
import feedbackRouter from "./routes/feedback.js"
import processConfigRouter from "./routes/process_config.js"
import paramsRouter from "./routes/params.js"
import weightingParamsRouter from "./routes/weighting-params.js"
import { seedAll } from "./fixtures/seed.js"

const app = express()
app.use(cors())
app.use(express.json())

// Never let browsers cache API/health/auth responses. Otherwise a stale entry
// (e.g. an index.html once served for an unknown route) gets replayed for an
// API URL and the SPA parses HTML as JSON and crashes.
app.use((req, res, next) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/health") || req.path.startsWith("/auth/")) {
    res.set("Cache-Control", "no-store")
  }
  next()
})

const PORT = Number(process.env.PORT) || Number(process.env.WEBSITES_PORT) || 5000
// When serving a real SPA build same-origin (prod demo), point at its directory.
const SPA_DIR = process.env.SPA_DIR || ""
// Demo mode: accept any bearer token (e.g. a real Entra token the mock can't
// verify) and return the mock user instead of 401. Off by default → local dev
// and e2e keep validating the app JWT exactly as before.
const ACCEPT_ANY_TOKEN = process.env.MOCK_ACCEPT_ANY_TOKEN === "true"

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
    if (ACCEPT_ANY_TOKEN) {
      // Demo: token didn't verify against the mock secret (e.g. a real Entra
      // token). Return the mock user so the SPA can render with sample data.
      return res.json({ email: "demo@numerator.com", name: "Demo User", roles: ["admin"], countries: ["*"] })
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
app.get("/api/v1/metadata/last-formato4", (req, res) => res.json({ countries: formato4Store.lastCompleted(req.query.period) }))
app.get("/api/v1/metadata/last-eligibility", (req, res) => res.json({ countries: eligibilityStore.lastCompleted(req.query.period) }))

app.use("/api/v1", syncRouter)
app.use("/api/v1", metadataRouter)
app.use("/api/v1", pricesRouter)
app.use("/api/v1", weightingRouter)
app.use("/api/v1", mtrRouter)
app.use("/api/v1", qmsTrRouter)
app.use("/api/v1", formato4Router)
app.use("/api/v1", eligibilityRouter)
app.use("/api/v1", processesRouter)
app.use("/api/v1", traceabilityRouter)
app.use("/api/v1", calibrationRouter)
app.use("/api/v1", testRouter)
app.use("/api/v1", adminRouter)
app.use("/api/v1", telemetryRouter)
app.use("/api/v1", feedbackRouter)
app.use("/api/v1", paramsRouter)
app.use("/api/v1", weightingParamsRouter)
app.use("/api/v1", processConfigRouter)

// ---------------------------------------------------------------------------
// SPA same-origin serving (prod demo). Only active when SPA_DIR is set, so it
// never affects local dev. Static assets first, then a catch-all that returns
// index.html for client-side router deep-links. API/health routes above keep
// precedence (registered first).
// ---------------------------------------------------------------------------

if (SPA_DIR) {
  app.use(express.static(SPA_DIR))
  app.use((req, res) => {
    // Never mask an unknown API/health/auth route with the SPA — returning
    // index.html (HTML) there makes the frontend parse HTML as JSON and crash.
    // Return a clean 404 instead; only real client-side routes get index.html.
    if (req.path.startsWith("/api/") || req.path.startsWith("/health") || req.path.startsWith("/auth/")) {
      return res.status(404).json({ error: "not_found", message: `No route ${req.method} ${req.path}` })
    }
    // Don't cache the SPA shell — it references hashed assets that change per build.
    res.set("Cache-Control", "no-store")
    res.sendFile(path.join(SPA_DIR, "index.html"))
  })
}

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
  console.log(`  ---  Formato 4: /api/v1/formato4/runs`)
  console.log(`  ---  Eligibility: /api/v1/eligibility/runs`)
  console.log(`  ---  Traceability: /api/v1/tags`)
  console.log(`  ---  Calibration download: /api/v1/calibration/:tag/download`)
  console.log(`  GET  /api/v1/events/:jobId/tables`)
  console.log(`  POST /api/v1/test/reset`)
  console.log(`\nPre-seeded ${jobs.size} sync jobs, ${pricesStore.runs.size} prices runs, ${weightingStore.runs.size} weighting runs, ${mtrStore.runs.size} mtr runs, ${formato4Store.runs.size} formato4 runs, ${eligibilityStore.runs.size} eligibility runs`)
})

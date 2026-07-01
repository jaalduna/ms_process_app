/**
 * Hybrid proxy server for E2E testing:
 * - Mocks metadata endpoints (countries, data-availability) and auth/me
 * - Proxies trigger/events to the real sql-databricks-bridge backend
 * - Routes new module endpoints (prices, weighting, mtr, traceability) to mock
 *
 * Usage:
 *   REAL_BACKEND=http://localhost:8000 node mock-server/hybrid-proxy.js
 */
import express from "express"
import cors from "cors"
import http from "http"
import { COUNTRIES } from "./routes/sync.js"

// Import mock module routers for new modules
import pricesRouter from "./routes/prices.js"
import weightingRouter from "./routes/weighting.js"
import mtrRouter from "./routes/mtr.js"
import traceabilityRouter from "./routes/traceability.js"
import testRouter from "./routes/test.js"
import { seedAll } from "./fixtures/seed.js"

const app = express()
app.use(cors())
app.use(express.json())

const PORT = 5000
const REAL_BACKEND = process.env.REAL_BACKEND || "http://localhost:8000"

// ---------------------------------------------------------------------------
// Mocked metadata endpoints
// ---------------------------------------------------------------------------

app.get("/api/v1/metadata/countries", (_req, res) => {
  res.json({ countries: COUNTRIES })
})

app.get("/api/v1/metadata/data-availability", (req, res) => {
  const { period } = req.query
  if (!period || !/^\d{6}$/.test(period)) return res.status(422).json({ error: "validation_error", message: "period must be YYYYMM format" })
  const countries = {}
  for (const c of COUNTRIES) {
    countries[c.code] = c.code === "bolivia" ? { elegibilidad: true, pesaje: true } : { elegibilidad: false, pesaje: false }
  }
  res.json({ period, countries })
})

app.get("/health/live", (_req, res) => res.json({ status: "ok" }))
app.get("/api/v1/health", (_req, res) => res.json({ status: "ok" }))
app.get("/api/v1/auth/me", (_req, res) => res.json({ email: "dev@localhost", name: "Dev User", roles: ["admin"], countries: ["*"] }))

// ---------------------------------------------------------------------------
// Mock new module endpoints (always mocked, never proxied)
// ---------------------------------------------------------------------------

app.use("/api/v1", pricesRouter)
app.use("/api/v1", weightingRouter)
app.use("/api/v1", mtrRouter)
app.use("/api/v1", traceabilityRouter)
app.use("/api/v1", testRouter)

// Seed mock data
seedAll()

// ---------------------------------------------------------------------------
// Proxy to real backend for trigger/events
// ---------------------------------------------------------------------------

function proxyToBackend(req, res) {
  const url = new URL(req.originalUrl, REAL_BACKEND)
  const options = {
    hostname: url.hostname, port: url.port, path: url.pathname + url.search,
    method: req.method, headers: { ...req.headers, host: url.host },
  }
  const proxyReq = http.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode)
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (key.toLowerCase() !== "transfer-encoding") res.setHeader(key, value)
    }
    proxyRes.pipe(res)
  })
  proxyReq.on("error", (err) => {
    console.error(`Proxy error: ${err.message}`)
    res.status(502).json({ error: "proxy_error", message: `Backend unavailable: ${err.message}` })
  })
  if (req.body && Object.keys(req.body).length > 0) proxyReq.write(JSON.stringify(req.body))
  proxyReq.end()
}

app.post("/api/v1/trigger", proxyToBackend)
app.get("/api/v1/events", proxyToBackend)
app.get("/api/v1/events/:jobId/download", proxyToBackend)
app.get("/api/v1/events/:jobId", proxyToBackend)
app.post("/api/v1/events/:jobId/cancel", proxyToBackend)

// Formato 4 lifecycle -> real backend (MTR-62). The Node mock only ever served
// the E3 contract; proxying /formato4/* lets the integration walkthrough drive
// the REAL fake-mode API (DATABRICKS_FAKE=true) and catch mock-vs-real
// divergence. The download streams the server-generated zip (pipe handles the
// binary body + Content-Disposition).
app.get("/api/v1/formato4/runs", proxyToBackend)
app.post("/api/v1/formato4/runs", proxyToBackend)
app.get("/api/v1/formato4/runs/:runId", proxyToBackend)
app.post("/api/v1/formato4/runs/:runId/execute", proxyToBackend)
app.post("/api/v1/formato4/runs/:runId/cancel", proxyToBackend)
app.get("/api/v1/formato4/runs/:runId/download", proxyToBackend)

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Hybrid proxy server running on http://localhost:${PORT}`)
  console.log(`  Mocked:  /metadata/*, /auth/me, /prices/*, /weighting/*, /mtr/*, /traceability/*`)
  console.log(`  Proxied: /trigger, /events/*, /formato4/* -> ${REAL_BACKEND}`)
})

import { Router } from "express"
import { RunStore } from "../stores/run-store.js"
import { COUNTRIES, isIntegerPeriod } from "./sync.js"

const router = Router()

const PRICES_STEPS = ["load_data", "detect_outliers", "generate_report", "complete"]

export const pricesStore = new RunStore("prices")

// ---------------------------------------------------------------------------
// Mock outlier data generator
// ---------------------------------------------------------------------------

const PRODUCTS = ["Leche Entera 1L", "Pan Molde 500g", "Arroz Grano Largo 1kg", "Aceite Vegetal 900ml", "Azúcar Blanca 1kg", "Harina 1kg", "Café Instantáneo 200g", "Detergente Líquido 1L", "Jabón Tocador 3pk", "Pasta Dental 100ml"]

function generateOutliers(country) {
  const count = Math.floor(Math.random() * 8) + 3
  return Array.from({ length: count }, (_, i) => ({
    product: PRODUCTS[i % PRODUCTS.length],
    declared_price: +(Math.random() * 5000 + 500).toFixed(0),
    historical_avg: +(Math.random() * 3000 + 400).toFixed(0),
    deviation_pct: +(Math.random() * 150 + 50).toFixed(1),
    reason: Math.random() > 0.5 ? "Price exceeds 2σ from historical mean" : "Price below minimum threshold",
    household_id: `HH-${country.toUpperCase()}-${Math.floor(Math.random() * 9000) + 1000}`,
  }))
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.post("/prices/runs", (req, res) => {
  const { country, period, parameters } = req.body
  if (!country || !period) return res.status(400).json({ error: "bad_request", message: "country and period are required" })
  if (!isIntegerPeriod(period)) return res.status(422).json({ error: "validation_error", message: "period must be an integer (YYYYMM)" })
  const run = pricesStore.create(country, period, PRICES_STEPS, parameters, { outliers: [], outliers_count: 0, approved_by: null, approved_at: null })
  res.status(201).json(run)
})

router.get("/prices/runs", (req, res) => {
  res.json(pricesStore.list(req.query))
})

router.get("/prices/runs/:runId", (req, res) => {
  const run = pricesStore.get(req.params.runId)
  if (!run) return res.status(404).json({ error: "not_found", message: `Run ${req.params.runId} not found` })
  res.json(run)
})

router.post("/prices/runs/:runId/execute", (req, res) => {
  const run = pricesStore.get(req.params.runId)
  if (!run) return res.status(404).json({ error: "not_found", message: `Run ${req.params.runId} not found` })
  if (run.status === "running") return res.status(409).json({ error: "conflict", message: "Run is already running" })
  pricesStore.execute(req.params.runId, (completedRun) => {
    if (completedRun.status === "completed") {
      completedRun.status = "results_ready"
      completedRun.outliers = generateOutliers(completedRun.country)
      completedRun.outliers_count = completedRun.outliers.length
    }
  })
  res.json(pricesStore.get(req.params.runId))
})

router.post("/prices/runs/:runId/approve", (req, res) => {
  const run = pricesStore.get(req.params.runId)
  if (!run) return res.status(404).json({ error: "not_found", message: `Run ${req.params.runId} not found` })
  if (run.status !== "results_ready") return res.status(409).json({ error: "conflict", message: `Cannot approve run with status "${run.status}"` })
  res.json(pricesStore.approve(req.params.runId))
})

router.post("/prices/runs/:runId/cancel", (req, res) => {
  const run = pricesStore.get(req.params.runId)
  if (!run) return res.status(404).json({ error: "not_found", message: `Run ${req.params.runId} not found` })
  if (!["running", "pending"].includes(run.status)) return res.status(409).json({ error: "conflict", message: `Cannot cancel run with status "${run.status}"` })
  res.json(pricesStore.cancel(req.params.runId))
})

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

export function seedPrices() {
  for (const c of COUNTRIES) {
    const run = pricesStore.seedCompleted(c.code, 202602, PRICES_STEPS, Math.floor(Math.random() * 5) + 1, { outliers: generateOutliers(c.code), outliers_count: Math.floor(Math.random() * 8) + 3, approved_by: "dev@localhost", approved_at: new Date(Date.now() - Math.random() * 86400000 * 3).toISOString() })
    run.status = "approved"
  }
}

export default router

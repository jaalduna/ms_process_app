import { Router } from "express"
import { RunStore } from "../stores/run-store.js"
import { COUNTRIES, isIntegerPeriod } from "./sync.js"
import { issueDownloadToken, validateDownloadToken } from "../lib/download-tokens.js"
import { J_SOURCE_SYNC, registerSnapshot, generateSnapshotTag } from "./snapshots.js"

const router = Router()

function weightingDownloadResource(runId) {
  return `weighting:${runId}`
}

function buildWeightingCsv(run) {
  const stats = run.summary_stats || { total_households: 100, weighted_households: 98, min_weight: 10, max_weight: 500, mean_weight: 120, median_weight: 110, std_dev: 45 }
  const rows = []
  rows.push("household_id,country,period,weight,stratum")
  for (let i = 1; i <= Math.min(stats.total_households, 50); i++) {
    const w = +(stats.min_weight + Math.random() * (stats.max_weight - stats.min_weight)).toFixed(2)
    rows.push(`HH-${String(i).padStart(5, "0")},${run.country},${run.period},${w},stratum_${(i % 5) + 1}`)
  }
  const csv = rows.join("\n")
  const filename = `weighting_${run.country}_${run.period}.csv`
  return { csv, filename }
}

const WEIGHTING_STEPS = ["load_eligible", "calculate_weights", "validate_distributions", "export_results", "complete"]

export const weightingStore = new RunStore("weighting")

// ---------------------------------------------------------------------------
// Mock weight summary generator
// ---------------------------------------------------------------------------

function generateWeightSummary() {
  const total = Math.floor(Math.random() * 3000) + 500
  const minW = +(Math.random() * 50 + 10).toFixed(2)
  const maxW = +(Math.random() * 500 + 200).toFixed(2)
  const mean = +((minW + maxW) / 2 + (Math.random() * 50 - 25)).toFixed(2)
  const median = +(mean + (Math.random() * 20 - 10)).toFixed(2)
  return { total_households: total, weighted_households: total - Math.floor(Math.random() * 20), min_weight: minW, max_weight: maxW, mean_weight: mean, median_weight: median, std_dev: +(Math.random() * 80 + 20).toFixed(2) }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.post("/weighting/runs", (req, res) => {
  const { country, period, parameters } = req.body
  if (!country || !period) return res.status(400).json({ error: "bad_request", message: "country and period are required" })
  if (!isIntegerPeriod(period)) return res.status(422).json({ error: "validation_error", message: "period must be an integer (YYYYMM)" })
  const run = weightingStore.create(country, period, WEIGHTING_STEPS, parameters, { summary_stats: null })
  res.status(201).json(run)
})

router.get("/weighting/runs", (req, res) => {
  res.json(weightingStore.list(req.query))
})

router.get("/weighting/runs/:runId", (req, res) => {
  const run = weightingStore.get(req.params.runId)
  if (!run) return res.status(404).json({ error: "not_found", message: `Run ${req.params.runId} not found` })
  res.json(run)
})

router.patch("/weighting/runs/:runId", (req, res) => {
  const run = weightingStore.get(req.params.runId)
  if (!run) return res.status(404).json({ error: "not_found", message: `Run ${req.params.runId} not found` })
  res.json(weightingStore.update(req.params.runId, req.body || {}))
})

router.post("/weighting/runs/:runId/execute", (req, res) => {
  const run = weightingStore.get(req.params.runId)
  if (!run) return res.status(404).json({ error: "not_found", message: `Run ${req.params.runId} not found` })
  if (run.status === "running") return res.status(409).json({ error: "conflict", message: "Run is already running" })

  // JAA-1179/JAA-1183: `j_source` opcional — "sync" (default) o el tag de una
  // versión bronze registrada. Se guarda en la corrida y, al completar, la
  // API real registra el tag efectivo desde el manifiesto `bronze_snapshot.json`;
  // el mock aproxima ese registro directamente.
  const jSource = req.body?.j_source || J_SOURCE_SYNC
  run.j_source = jSource

  weightingStore.execute(req.params.runId, (completedRun) => {
    if (completedRun.status === "completed") {
      completedRun.summary_stats = generateWeightSummary()
      const tag = jSource !== J_SOURCE_SYNC ? jSource : generateSnapshotTag(completedRun.country, completedRun.period)
      completedRun.snapshot_tag = tag
      registerSnapshot("pesaje", { country: completedRun.country, period: completedRun.period, tag })
    }
  })
  res.json(weightingStore.get(req.params.runId))
})

router.get("/weighting/runs/:runId/download", (req, res) => {
  const run = weightingStore.get(req.params.runId)
  if (!run) return res.status(404).json({ error: "not_found", message: `Run ${req.params.runId} not found` })
  if (run.status !== "completed") return res.status(409).json({ error: "conflict", message: "Run is not completed" })

  const { csv, filename } = buildWeightingCsv(run)
  res.setHeader("Content-Type", "text/csv")
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
  res.send(csv)
})

// ---------------------------------------------------------------------------
// GET /weighting/runs/:runId/download-url   (JAA-757/758)
// GET /weighting/runs/:runId/download-signed?token=
// Same signed-URL contract as calibration: issue a short-lived token, then
// let the browser navigate natively to download-signed (no auth header).
// ---------------------------------------------------------------------------

router.get("/weighting/runs/:runId/download-url", (req, res) => {
  const run = weightingStore.get(req.params.runId)
  if (!run) return res.status(404).json({ error: "not_found", message: `Run ${req.params.runId} not found` })
  if (run.status !== "completed") return res.status(409).json({ error: "conflict", message: "Run is not completed" })

  const { token, expiresIn } = issueDownloadToken(weightingDownloadResource(req.params.runId))
  res.json({
    url: `/api/v1/weighting/runs/${req.params.runId}/download-signed?token=${token}`,
    expires_in: expiresIn,
  })
})

router.get("/weighting/runs/:runId/download-signed", (req, res) => {
  const failure = validateDownloadToken(req.query.token, weightingDownloadResource(req.params.runId))
  if (failure) {
    return res.status(failure.status).json({ error: failure.error, message: failure.message })
  }
  const run = weightingStore.get(req.params.runId)
  if (!run) return res.status(404).json({ error: "not_found", message: `Run ${req.params.runId} not found` })
  if (run.status !== "completed") return res.status(409).json({ error: "conflict", message: "Run is not completed" })

  const { csv, filename } = buildWeightingCsv(run)
  res.setHeader("Content-Type", "text/csv")
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
  res.send(csv)
})

router.post("/weighting/runs/:runId/cancel", (req, res) => {
  const run = weightingStore.get(req.params.runId)
  if (!run) return res.status(404).json({ error: "not_found", message: `Run ${req.params.runId} not found` })
  if (!["running", "pending"].includes(run.status)) return res.status(409).json({ error: "conflict", message: `Cannot cancel run with status "${run.status}"` })
  res.json(weightingStore.cancel(req.params.runId))
})

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

export function seedWeighting() {
  for (const c of COUNTRIES) {
    const run = weightingStore.seedCompleted(c.code, 202602, WEIGHTING_STEPS, Math.floor(Math.random() * 5) + 1, { summary_stats: generateWeightSummary() })
    run.status = "completed"
  }
}

export default router

import { Router } from "express"
import { EligibilityStore } from "../stores/eligibility-store.js"
import { COUNTRIES, isIntegerPeriod } from "./sync.js"

const router = Router()

export const eligibilityStore = new EligibilityStore()

function notFound(res, runId) {
  return res.status(404).json({ error: "not_found", message: `Eligibility run ${runId} not found` })
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

router.get("/eligibility/runs", (req, res) => {
  res.json(eligibilityStore.list(req.query))
})

router.post("/eligibility/runs", (req, res) => {
  const { country, period, parameters } = req.body || {}
  if (!country || !period) {
    return res.status(400).json({ error: "bad_request", message: "country and period are required" })
  }
  if (!isIntegerPeriod(period)) {
    return res.status(422).json({ error: "validation_error", message: "period must be an integer (YYYYMM)" })
  }
  const run = eligibilityStore.create(country, period, parameters)
  res.status(201).json(run)
})

router.get("/eligibility/runs/:runId", (req, res) => {
  const run = eligibilityStore.get(req.params.runId)
  if (!run) return notFound(res, req.params.runId)
  res.json(run)
})

router.patch("/eligibility/runs/:runId", (req, res) => {
  const run = eligibilityStore.get(req.params.runId)
  if (!run) return notFound(res, req.params.runId)
  res.json(eligibilityStore.update(req.params.runId, req.body || {}))
})

router.delete("/eligibility/runs/:runId", (req, res) => {
  const run = eligibilityStore.get(req.params.runId)
  if (!run) return notFound(res, req.params.runId)
  eligibilityStore.delete(req.params.runId)
  res.json({ deleted: true, run_id: req.params.runId })
})

// ---------------------------------------------------------------------------
// State-machine actions
// ---------------------------------------------------------------------------

router.post("/eligibility/runs/:runId/execute", (req, res) => {
  const run = eligibilityStore.get(req.params.runId)
  if (!run) return notFound(res, req.params.runId)
  if (run.status !== "pending") {
    return res.status(409).json({ error: "conflict", message: `Cannot execute run with status "${run.status}"` })
  }
  res.json(eligibilityStore.execute(req.params.runId))
})

router.post("/eligibility/runs/:runId/approve", (req, res) => {
  const run = eligibilityStore.get(req.params.runId)
  if (!run) return notFound(res, req.params.runId)
  if (run.status !== "results_ready") {
    return res.status(409).json({ error: "conflict", message: `Cannot approve run with status "${run.status}"` })
  }
  res.json(eligibilityStore.approve(req.params.runId))
})

router.post("/eligibility/runs/:runId/apply-mordom", (req, res) => {
  const run = eligibilityStore.get(req.params.runId)
  if (!run) return notFound(res, req.params.runId)
  if (run.status !== "mordom_uploaded") {
    return res.status(409).json({ error: "conflict", message: `Cannot apply MorDom for run with status "${run.status}"` })
  }
  res.json(eligibilityStore.applyMordom(req.params.runId))
})

router.post("/eligibility/runs/:runId/cancel", (req, res) => {
  const run = eligibilityStore.get(req.params.runId)
  if (!run) return notFound(res, req.params.runId)
  if (["ready", "failed", "cancelled"].includes(run.status)) {
    return res.status(409).json({ error: "conflict", message: `Cannot cancel run with status "${run.status}"` })
  }
  res.json(eligibilityStore.cancel(req.params.runId))
})

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

router.get("/eligibility/runs/:runId/files", (req, res) => {
  const run = eligibilityStore.get(req.params.runId)
  if (!run) return notFound(res, req.params.runId)
  res.json(run.files)
})

router.get("/eligibility/runs/:runId/files/:fileId/download", (req, res) => {
  const run = eligibilityStore.get(req.params.runId)
  if (!run) return notFound(res, req.params.runId)
  const file = run.files.find(f => f.file_id === req.params.fileId)
  if (!file) {
    return res.status(404).json({ error: "not_found", message: `File ${req.params.fileId} not found in run` })
  }

  // Synthesize CSV content appropriate to the file stage.
  const lines =
    file.stage === 2
      ? ["household_id,country,period,status,action", ...Array.from({ length: 30 }, (_, i) =>
          `HH-${String(i + 1).padStart(5, "0")},${run.country},${run.period},new,keep`)]
      : ["household_id,country,period,eligible,colaboracion", ...Array.from({ length: 50 }, (_, i) =>
          `HH-${String(i + 1).padStart(5, "0")},${run.country},${run.period},${i % 7 === 0 ? "false" : "true"},${(Math.random()).toFixed(3)}`)]

  res.setHeader("Content-Type", "text/csv")
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`)
  res.send(lines.join("\n"))
})

// POST upload (multipart/form-data). express.json() leaves the body unparsed for
// multipart; the mock records the upload and synthesizes the stored file.
router.post("/eligibility/runs/:runId/upload", (req, res) => {
  const run = eligibilityStore.get(req.params.runId)
  if (!run) return notFound(res, req.params.runId)
  const filename = req.query.filename || `mordom_corrected_${run.country}_${run.period}.csv`
  const file = eligibilityStore.upload(req.params.runId, filename)
  res.status(201).json(file)
})

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

function previousMonthPeriod() {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return Number(`${prev.getFullYear()}${String(prev.getMonth() + 1).padStart(2, "0")}`)
}

export function seedEligibility() {
  const period = previousMonthPeriod()
  // Seed a couple of fully-ready runs for list realism + last-completion lookups.
  // Leave other countries empty so the "Ejecutar" flow is exercisable in e2e.
  eligibilityStore.seedReady("mexico", period, 2)
  eligibilityStore.seedReady("colombia", period, 3)
}

export default router

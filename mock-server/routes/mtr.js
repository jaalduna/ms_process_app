import { Router } from "express"
import { RunStore } from "../stores/run-store.js"
import { COUNTRIES } from "./sync.js"

const router = Router()

const MTR_STEPS = ["generate_targets", "compute_imputations", "validate_results", "export_results", "complete"]

export const mtrStore = new RunStore("mtr")

// ---------------------------------------------------------------------------
// Mock imputation results generator
// ---------------------------------------------------------------------------

function generateMtrSummary() {
  const totalTargets = Math.floor(Math.random() * 200) + 50
  const achieved = Math.floor(totalTargets * (0.8 + Math.random() * 0.2))
  return {
    total_targets: totalTargets,
    targets_achieved: achieved,
    total_imputations: Math.floor(Math.random() * 5000) + 500,
    quality_score: +(0.85 + Math.random() * 0.14).toFixed(3),
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.post("/mtr/runs", (req, res) => {
  const { country, period, parameters } = req.body
  if (!country || !period) return res.status(400).json({ error: "bad_request", message: "country and period are required" })
  const run = mtrStore.create(country, period, MTR_STEPS, parameters, { results_summary: null })
  res.status(201).json(run)
})

router.get("/mtr/runs", (req, res) => {
  res.json(mtrStore.list(req.query))
})

router.get("/mtr/runs/:runId", (req, res) => {
  const run = mtrStore.get(req.params.runId)
  if (!run) return res.status(404).json({ error: "not_found", message: `Run ${req.params.runId} not found` })
  res.json(run)
})

router.post("/mtr/runs/:runId/execute", (req, res) => {
  const run = mtrStore.get(req.params.runId)
  if (!run) return res.status(404).json({ error: "not_found", message: `Run ${req.params.runId} not found` })
  if (run.status === "running") return res.status(409).json({ error: "conflict", message: "Run is already running" })
  mtrStore.execute(req.params.runId, (completedRun) => {
    if (completedRun.status === "completed") completedRun.results_summary = generateMtrSummary()
  })
  res.json(mtrStore.get(req.params.runId))
})

router.post("/mtr/runs/:runId/cancel", (req, res) => {
  const run = mtrStore.get(req.params.runId)
  if (!run) return res.status(404).json({ error: "not_found", message: `Run ${req.params.runId} not found` })
  if (!["running", "pending"].includes(run.status)) return res.status(409).json({ error: "conflict", message: `Cannot cancel run with status "${run.status}"` })
  res.json(mtrStore.cancel(req.params.runId))
})

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

export function seedMtr() {
  for (const c of COUNTRIES) {
    mtrStore.seedCompleted(c.code, 202602, MTR_STEPS, Math.floor(Math.random() * 5) + 1, { results_summary: generateMtrSummary() })
  }
}

export default router

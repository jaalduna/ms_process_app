import { Router } from "express"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { RunStore } from "../stores/run-store.js"
import { COUNTRIES, isIntegerPeriod } from "./sync.js"

const router = Router()

// Verbatim Databricks task_keys — monitor.map_run_to_steps() joins tasks→steps
// by name, so these MUST match the contract (MTR-26) exactly.
const FORMATO4_STEPS = ["sync", "merge", "simulate", "format_4", "zip"]

// Real sample zip the download endpoint streams. Committed fixture so the mock
// needs no zip library at runtime (matches the MTR-22 artifact shape).
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_ZIP = path.join(__dirname, "..", "fixtures", "format_4_sample.csv.zip")

export const formato4Store = new RunStore("formato4")

// ---------------------------------------------------------------------------
// Mock results summary generator (mirrors _metadata.json the writer emits)
// ---------------------------------------------------------------------------

function generateFormato4Summary(country, period) {
  return {
    country,
    period: Number(period),
    row_count: Math.floor(Math.random() * 90000) + 10000,
    generated_at: new Date().toISOString(),
    sim_wheel_version: "3.0.0-dev-gold",
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.post("/formato4/runs", (req, res) => {
  const { country, period, parameters } = req.body
  if (!country || !period) return res.status(400).json({ error: "bad_request", message: "country and period are required" })
  if (!isIntegerPeriod(period)) return res.status(422).json({ error: "validation_error", message: "period must be an integer (YYYYMM)" })
  const run = formato4Store.create(country, period, FORMATO4_STEPS, parameters, { results_summary: null })
  res.status(201).json(run)
})

router.get("/formato4/runs", (req, res) => {
  res.json(formato4Store.list(req.query))
})

router.get("/formato4/runs/:runId", (req, res) => {
  const run = formato4Store.get(req.params.runId)
  if (!run) return res.status(404).json({ error: "not_found", message: `Run ${req.params.runId} not found` })
  res.json(run)
})

router.post("/formato4/runs/:runId/execute", (req, res) => {
  const run = formato4Store.get(req.params.runId)
  if (!run) return res.status(404).json({ error: "not_found", message: `Run ${req.params.runId} not found` })
  if (run.status === "running") return res.status(409).json({ error: "conflict", message: "Run is already running" })
  if (run.status !== "pending") return res.status(409).json({ error: "conflict", message: `Cannot execute run with status "${run.status}"` })
  formato4Store.execute(req.params.runId, (completedRun) => {
    if (completedRun.status === "completed") completedRun.results_summary = generateFormato4Summary(completedRun.country, completedRun.period)
  })
  res.json(formato4Store.get(req.params.runId))
})

router.post("/formato4/runs/:runId/cancel", (req, res) => {
  const run = formato4Store.get(req.params.runId)
  if (!run) return res.status(404).json({ error: "not_found", message: `Run ${req.params.runId} not found` })
  if (!["running", "pending"].includes(run.status)) return res.status(409).json({ error: "conflict", message: `Cannot cancel run with status "${run.status}"` })
  res.json(formato4Store.cancel(req.params.runId))
})

router.get("/formato4/runs/:runId/download", (req, res) => {
  const run = formato4Store.get(req.params.runId)
  if (!run) return res.status(404).json({ error: "not_found", message: `Run ${req.params.runId} not found` })
  if (run.status !== "completed") return res.status(409).json({ error: "conflict", message: "Run is not completed" })

  const zipBytes = fs.readFileSync(FIXTURE_ZIP)
  const filename = `format_4_${run.country}_${run.period}.csv.zip`
  res.setHeader("Content-Type", "application/zip")
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
  res.send(zipBytes)
})

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

export function seedFormato4() {
  for (const c of COUNTRIES) {
    const run = formato4Store.seedCompleted(c.code, 202602, FORMATO4_STEPS, Math.floor(Math.random() * 5) + 1, { results_summary: generateFormato4Summary(c.code, 202602) })
    run.status = "completed"
  }
}

export default router

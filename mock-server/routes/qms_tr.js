import { Router } from "express"
import crypto from "crypto"

const router = Router()

// Per-step delay for run progression; same knob sync.js uses (fast e2e via
// MOCK_STEP_INTERVAL_MS), falls back to 2000ms.
const STEP_INTERVAL_MS = () => Number(process.env.MOCK_STEP_INTERVAL_MS) || 2000

// Placeholder step names — the real Databricks pipeline for QMS-TR
// (qms_tr_silver_builder -> qms_tr_kpis_batch -> export) is not confirmed/wired
// yet. These MUST be synced with whatever names the real backend returns once
// that's known (Stage B) — do not treat them as a stable contract in the
// frontend.
const QMS_TR_STEPS = ["silver_builder", "kpis_batch", "export_zip"]

const uuid = () => crypto.randomUUID()
const isoNow = () => new Date().toISOString()

function makeSteps() {
  return QMS_TR_STEPS.map((name) => ({ name, status: "pending", started_at: null, completed_at: null, error: null }))
}

/** @type {Map<string, object>} */
export const qmsTrJobs = new Map()
/** @type {Map<string, NodeJS.Timeout>} */
const timers = new Map()

export function resetQmsTrJobs() {
  for (const timer of timers.values()) clearInterval(timer)
  timers.clear()
  qmsTrJobs.clear()
}

function advanceJob(jobId) {
  const job = qmsTrJobs.get(jobId)
  if (!job) return
  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") return

  const stepIdx = job._stepIndex ?? 0
  if (stepIdx >= job.steps.length) return
  const step = job.steps[stepIdx]

  if (step.status === "pending") {
    step.status = "running"
    step.started_at = isoNow()
    job.current_step = step.name
    return
  }

  if (step.status === "running") {
    // force_outcome="fail" always fails at the configured step; "pass" never
    // fails; unset falls back to a small random chance (mirrors sync.js).
    const shouldFail = job._forceOutcome === "fail" ? step.name === job._failAtStep : job._forceOutcome === "pass" ? false : Math.random() < 0.05

    if (shouldFail) {
      step.status = "failed"
      step.completed_at = isoNow()
      step.error = `Step "${step.name}" failed: simulated error`
      job.status = "failed"
      job.completed_at = isoNow()
      job.current_step = null
      job.error_message = `Pipeline failed at step: ${step.name}`
      return
    }

    step.status = "completed"
    step.completed_at = isoNow()
    job._stepIndex = stepIdx + 1

    if (job._stepIndex < job.steps.length) {
      job.status = "running"
    } else {
      job.status = "completed"
      job.completed_at = isoNow()
      job.current_step = null
    }
  }
}

function startProgression(jobId) {
  const timer = setInterval(() => {
    advanceJob(jobId)
    const job = qmsTrJobs.get(jobId)
    if (!job || job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
      clearInterval(timer)
      timers.delete(jobId)
    }
  }, STEP_INTERVAL_MS())
  timers.set(jobId, timer)
}

function serializeJob(job) {
  const { _stepIndex, _forceOutcome, _failAtStep, ...rest } = job
  return rest
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// POST /qms_tr/runs — create a run for a country + ano_base and start
// progression immediately (same combined create+trigger pattern as sync.js's
// POST /trigger).
router.post("/qms_tr/runs", (req, res) => {
  const { country, ano_base, force_outcome, fail_at_step } = req.body || {}
  if (!country || ano_base === undefined || ano_base === null) {
    return res.status(400).json({ error: "bad_request", message: "country and ano_base are required" })
  }

  const jobId = uuid()
  const now = isoNow()
  const steps = makeSteps()
  const job = {
    job_id: jobId,
    country,
    ano_base,
    status: "pending",
    tag: `qms_tr-${country}-${ano_base}-${Date.now()}`,
    created_at: now,
    started_at: null,
    completed_at: null,
    triggered_by: "qms-tr-mock",
    current_step: steps[0].name,
    error_message: null,
    steps,
    _stepIndex: 0,
    _forceOutcome: force_outcome ?? null,
    _failAtStep: fail_at_step ?? QMS_TR_STEPS[1],
  }
  job.status = "running"
  job.started_at = now
  job.steps[0].status = "running"
  job.steps[0].started_at = now

  qmsTrJobs.set(jobId, job)
  startProgression(jobId)

  res.status(201).json(serializeJob(job))
})

// GET /qms_tr/runs — list/filter, feeds a future history modal.
router.get("/qms_tr/runs", (req, res) => {
  const { country, status, limit: ls, offset: os } = req.query
  const limit = parseInt(ls, 10) || 50
  const offset = parseInt(os, 10) || 0
  let items = Array.from(qmsTrJobs.values()).map(serializeJob)
  if (country) items = items.filter((j) => j.country === country)
  if (status) items = items.filter((j) => j.status === status)
  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  res.json({ items: items.slice(offset, offset + limit), total: items.length, limit, offset })
})

// GET /qms_tr/runs/{id} — status + steps, advances via the background
// interval (same temporal mechanism sync.js uses), observable on each poll.
router.get("/qms_tr/runs/:jobId", (req, res) => {
  const job = qmsTrJobs.get(req.params.jobId)
  if (!job) return res.status(404).json({ error: "not_found", message: `Run ${req.params.jobId} not found` })
  res.json(serializeJob(job))
})

function findJobByIdOrTag(idOrTag) {
  return qmsTrJobs.get(idOrTag) ?? Array.from(qmsTrJobs.values()).find((j) => j.tag === idOrTag) ?? null
}

// GET /qms_tr/{tag_or_id}/download — synthetic zip once the run is finished.
router.get("/qms_tr/:tagOrId/download", (req, res) => {
  const job = findJobByIdOrTag(req.params.tagOrId)
  if (!job) return res.status(404).json({ error: "not_found", message: `Run ${req.params.tagOrId} not found` })
  if (job.status !== "completed" && job.status !== "failed") {
    return res.status(409).json({ error: "job_not_finished", message: `Job is still ${job.status}` })
  }

  const filename = `qms_tr_${job.country}_${job.ano_base}_${job.job_id.slice(0, 8)}.zip`
  const content = Buffer.from(`QMS-TR synthetic export\njob_id,${job.job_id}\ncountry,${job.country}\nano_base,${job.ano_base}\nstatus,${job.status}\n`)
  res.setHeader("Content-Type", "application/zip")
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
  res.send(content)
})

export default router

import { Router } from "express"
import { resetJobs, seedRunningJob } from "./sync.js"
import { pricesStore, seedPrices } from "./prices.js"
import { weightingStore, seedWeighting } from "./weighting.js"
import { mtrStore, seedMtr } from "./mtr.js"
import { formato4Store, seedFormato4 } from "./formato4.js"
import { eligibilityStore, seedEligibility } from "./eligibility.js"
import { processStore, seedProcesses } from "./processes.js"
import { tagStore, seedTraceability } from "./traceability.js"
import { seedParams } from "./params.js"
import { resetWeightingParams } from "./weighting-params.js"
import { seedProcessConfig } from "./process_config.js"
import { seedSyncJobs } from "../fixtures/seed.js"

const router = Router()

/**
 * POST /api/v1/test/reset
 * Clears all in-memory state, re-seeds with default fixtures, and enables
 * deterministic mode (no random step failures) on all run stores.
 * Used by E2E tests for deterministic starting state.
 */
router.post("/test/reset", (_req, res) => {
  // Clear all stores
  resetJobs()
  pricesStore.reset()
  weightingStore.reset()
  mtrStore.reset()
  formato4Store.reset()
  eligibilityStore.reset()
  processStore.reset()
  tagStore.reset()
  resetWeightingParams()

  // Enable deterministic mode on all run stores so E2E happy-path tests
  // never fail due to the 5% random failure in _advanceStep().
  pricesStore.setDeterministic(true)
  weightingStore.setDeterministic(true)
  mtrStore.setDeterministic(true)
  formato4Store.setDeterministic(true)

  // Re-seed
  seedSyncJobs()
  seedPrices()
  seedWeighting()
  seedMtr()
  seedFormato4()
  seedEligibility()
  seedProcesses()
  seedTraceability()
  seedParams()
  seedProcessConfig()

  res.json({ status: "ok", message: "All stores reset, re-seeded, and deterministic mode enabled" })
})

/**
 * POST /api/v1/test/fail-run/:runId
 * Force a run to fail at a specific step. Used by E2E error-path tests
 * (FR-06, FR-14) to deterministically produce a failed run.
 *
 * Body: { "step": "<step_name>" }
 *   If step is omitted, fails at the first pending/running step.
 *
 * The store is auto-detected by checking all run stores for the given runId.
 */
router.post("/test/fail-run/:runId", (req, res) => {
  const { runId } = req.params
  const { step } = req.body || {}

  // Find which store owns this run
  const stores = [pricesStore, weightingStore, mtrStore]
  const store = stores.find(s => s.get(runId))
  if (!store) {
    return res.status(404).json({ error: "not_found", message: `Run ${runId} not found in any store` })
  }

  const run = store.get(runId)

  // Determine which step to fail at
  let targetStep = step
  if (!targetStep) {
    // Default: fail at the next running or pending step
    const nextStep = run.steps.find(s => s.status === "running" || s.status === "pending")
    if (!nextStep) {
      return res.status(409).json({ error: "conflict", message: "No pending or running steps to fail" })
    }
    targetStep = nextStep.name
  }

  // Verify the target step exists in this run
  const stepExists = run.steps.some(s => s.name === targetStep)
  if (!stepExists) {
    return res.status(400).json({ error: "bad_request", message: `Step "${targetStep}" not found in run. Available: ${run.steps.map(s => s.name).join(", ")}` })
  }

  store.forceFailAtStep(runId, targetStep)
  res.json({ status: "ok", message: `Run ${runId} will fail at step "${targetStep}"`, run_id: runId, fail_at_step: targetStep })
})

/**
 * POST /api/v1/test/seed-calibration-run
 * Seed a frozen "running" calibration job into the shared run store so E2E can
 * assert JAA-648's server-authoritative active-run derivation (recovered after
 * reload, shared across browsers) without racing the fast step interval.
 *
 * Body: { "country": "mexico", "period": "202601" }
 */
router.post("/test/seed-calibration-run", (req, res) => {
  const { country, period } = req.body || {}
  if (!country) return res.status(400).json({ error: "bad_request", message: "country is required" })
  const job = seedRunningJob(country, "calibracion", period ?? null)
  res.status(201).json({ status: "ok", job_id: job.job_id, country, period: job.period })
})

export default router

import { seedCompletedJob, seedFailedJob, defaultPeriod } from "../routes/sync.js"
import { seedPrices } from "../routes/prices.js"
import { seedWeighting } from "../routes/weighting.js"
import { seedMtr } from "../routes/mtr.js"
import { seedEligibility } from "../routes/eligibility.js"
import { seedProcesses } from "../routes/processes.js"
import { seedTraceability } from "../routes/traceability.js"
import { seedParams } from "../routes/params.js"

const CURRENT_PERIOD = "202602"
const PREVIOUS_PERIOD = "202601"
const FULL_COUNTRIES = ["argentina", "bolivia", "brasil", "chile", "colombia", "mexico"]

/**
 * Seed sync/calibration jobs (existing behavior from original server.js).
 */
export function seedSyncJobs() {
  // Current period — most countries: elegibilidad + pesaje completed
  for (const country of FULL_COUNTRIES) {
    seedCompletedJob(country, "elegibilidad", CURRENT_PERIOD, Math.floor(Math.random() * 5) + 1)
    seedCompletedJob(country, "pesaje", CURRENT_PERIOD, Math.floor(Math.random() * 3))
  }
  // Peru: only elegibilidad
  seedCompletedJob("peru", "elegibilidad", CURRENT_PERIOD, 2)
  // Ecuador and CAM: failed elegibilidad
  seedFailedJob("ecuador", "elegibilidad", CURRENT_PERIOD, 2)
  seedFailedJob("cam", "elegibilidad", CURRENT_PERIOD, 3)

  // Previous period
  for (const country of ["argentina", "chile", "colombia", "peru"]) {
    seedCompletedJob(country, "elegibilidad", PREVIOUS_PERIOD, 30 + Math.floor(Math.random() * 5))
    seedCompletedJob(country, "pesaje", PREVIOUS_PERIOD, 28 + Math.floor(Math.random() * 5))
  }
  seedCompletedJob("bolivia", "elegibilidad", PREVIOUS_PERIOD, 32)

  // Default landing period (previous month): seed Sync (inicio) + Calibración
  // (calibracion) history so the Sync/Cal badges and the per-card history modal
  // show real variety instead of "never"/empty on first load. Aligns with the
  // availability spread in metadata.js.
  const DEFAULT_PERIOD = defaultPeriod()
  // Sync (inicio) — recent for every country that has data.
  for (const country of ["argentina", "bolivia", "brasil", "chile", "colombia", "mexico", "peru"]) {
    seedCompletedJob(country, "inicio", DEFAULT_PERIOD, Math.floor(Math.random() * 4) + 1)
  }
  // Calibración — completed (drives "Cal: Xd ago" + history).
  for (const country of ["argentina", "chile", "mexico"]) {
    seedCompletedJob(country, "calibracion", DEFAULT_PERIOD, Math.floor(Math.random() * 5) + 1)
  }
  // Brasil: a completed run plus an earlier failed run (mixed history).
  seedCompletedJob("brasil", "calibracion", DEFAULT_PERIOD, 2)
  seedFailedJob("brasil", "calibracion", DEFAULT_PERIOD, 4)
  // Colombia: only a failed calibración → "Cal: never" badge but a failed run in history.
  seedFailedJob("colombia", "calibracion", DEFAULT_PERIOD, 1)
}

/**
 * Seed all modules.
 */
export function seedAll() {
  seedSyncJobs()
  seedPrices()
  seedWeighting()
  seedMtr()
  seedEligibility()
  seedProcesses()
  seedTraceability()
  seedParams()
}

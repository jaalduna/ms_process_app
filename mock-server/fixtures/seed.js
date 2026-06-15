import { seedCompletedJob, seedFailedJob } from "../routes/sync.js"
import { seedPrices } from "../routes/prices.js"
import { seedWeighting } from "../routes/weighting.js"
import { seedMtr } from "../routes/mtr.js"
import { seedEligibility } from "../routes/eligibility.js"
import { seedTraceability } from "../routes/traceability.js"

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

  // Calibración history — needed so the per-country Calibration History modal has
  // completed runs to list and download (the CSV-download-with-streaming flow).
  for (const country of ["argentina", "chile", "mexico", "brasil"]) {
    seedCompletedJob(country, "calibracion", CURRENT_PERIOD, Math.floor(Math.random() * 5) + 1)
  }
  // Brasil also has an earlier failed calibración (mixed history); Colombia only failed.
  seedFailedJob("brasil", "calibracion", PREVIOUS_PERIOD, 8)
  seedFailedJob("colombia", "calibracion", CURRENT_PERIOD, 1)
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
  seedTraceability()
}

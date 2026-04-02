import { Router } from "express"
import { resetJobs } from "./sync.js"
import { pricesStore, seedPrices } from "./prices.js"
import { weightingStore, seedWeighting } from "./weighting.js"
import { mtrStore, seedMtr } from "./mtr.js"
import { tagStore, seedTraceability } from "./traceability.js"
import { seedSyncJobs } from "../fixtures/seed.js"

const router = Router()

/**
 * POST /api/v1/test/reset
 * Clears all in-memory state and re-seeds with default fixtures.
 * Used by E2E tests for deterministic starting state.
 */
router.post("/test/reset", (_req, res) => {
  // Clear all stores
  resetJobs()
  pricesStore.reset()
  weightingStore.reset()
  mtrStore.reset()
  tagStore.reset()

  // Re-seed
  seedSyncJobs()
  seedPrices()
  seedWeighting()
  seedMtr()
  seedTraceability()

  res.json({ status: "ok", message: "All stores reset and re-seeded" })
})

export default router

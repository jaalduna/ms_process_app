import { Router } from "express"
import { COUNTRIES, jobs, defaultPeriod } from "./sync.js"
import { eligibilityStore } from "./eligibility.js"

const router = Router()

// ---------------------------------------------------------------------------
// Static metadata
// ---------------------------------------------------------------------------

router.get("/metadata/countries", (_req, res) => {
  res.json({ countries: COUNTRIES.map(({ code, queries, queries_count }) => ({ code, queries, queries_count, type: "country" })) })
})

router.get("/metadata/stages", (_req, res) => {
  res.json({
    stages: [
      { code: "inicio", name: "Inicio" },
      { code: "precios", name: "Precios" },
      { code: "elegibilidad", name: "Elegibilidad" },
      { code: "pesaje", name: "Pesaje" },
      { code: "calibracion", name: "Calibracion" },
      { code: "mtr", name: "MTR" },
    ],
  })
})

// ---------------------------------------------------------------------------
// Data availability (mock)
// ---------------------------------------------------------------------------

const MOCK_AVAILABILITY = {
  "202602": {
    argentina: { elegibilidad: true, pesaje: true }, bolivia: { elegibilidad: true, pesaje: true },
    brasil: { elegibilidad: true, pesaje: true }, cam: { elegibilidad: false, pesaje: false },
    chile: { elegibilidad: true, pesaje: true }, colombia: { elegibilidad: true, pesaje: true },
    ecuador: { elegibilidad: false, pesaje: false }, mexico: { elegibilidad: true, pesaje: true },
    peru: { elegibilidad: true, pesaje: false },
  },
  "202601": {
    argentina: { elegibilidad: true, pesaje: true }, bolivia: { elegibilidad: true, pesaje: false },
    chile: { elegibilidad: true, pesaje: true }, colombia: { elegibilidad: true, pesaje: true },
    peru: { elegibilidad: true, pesaje: true },
  },
}

// Default landing period (previous month): a deliberate spread so each card
// demonstrates a distinct path on first load — full availability (Calibrar
// enabled), elegibilidad-only (partial), and no data (Calibrar disabled).
MOCK_AVAILABILITY[defaultPeriod()] = {
  argentina: { elegibilidad: true, pesaje: true },   // full → trigger + success
  bolivia: { elegibilidad: true, pesaje: false },    // partial (pesaje missing)
  brasil: { elegibilidad: true, pesaje: true },      // full
  cam: { elegibilidad: false, pesaje: false },       // no data → Calibrar disabled
  chile: { elegibilidad: true, pesaje: true },       // full → success
  colombia: { elegibilidad: true, pesaje: true },    // full → trigger fails (demo failure path)
  ecuador: { elegibilidad: false, pesaje: false },   // no data → Calibrar disabled
  mexico: { elegibilidad: true, pesaje: true },      // full → success
  peru: { elegibilidad: true, pesaje: false },       // partial (pesaje missing)
}

router.get("/metadata/data-availability", (req, res) => {
  const { period } = req.query
  if (!period || !/^\d{6}$/.test(period)) return res.status(422).json({ error: "validation_error", message: "period must be YYYYMM format" })
  const periodData = MOCK_AVAILABILITY[period] || {}
  const countries = {}
  for (const c of COUNTRIES) countries[c.code] = periodData[c.code] || { elegibilidad: false, pesaje: false }
  res.json({ period, countries })
})

// ---------------------------------------------------------------------------
// Last-completion endpoints (sync jobs)
// ---------------------------------------------------------------------------

// @param {number|string} [period] optional YYYYMM — restrict to jobs of this
//   period. Omitted ⇒ latest overall (backward compatible). See JAA-421.
function lastCompletedByStage(stage, period) {
  const result = {}
  for (const job of jobs.values()) {
    if (job.status !== "completed" || job.stage !== stage) continue
    if (period != null && String(job.period) !== String(period)) continue
    const prev = result[job.country]
    if (!prev || new Date(job.completed_at) > new Date(prev.completed_at)) {
      result[job.country] = { country: job.country, completed_at: job.completed_at, run_id: job.job_id, period: job.period }
    }
  }
  return result
}

router.get("/metadata/last-sync", (_req, res) => res.json({ countries: lastCompletedByStage("inicio") }))
router.get("/metadata/last-calibration", (req, res) => res.json({ countries: lastCompletedByStage("calibracion", req.query.period) }))
// Eligibility runs live in their own store (a multi-phase, user-gated state
// machine), NOT in the generic `jobs` store — so lastCompletedByStage("elegibilidad")
// would always be empty and the card badge would read "never" forever (JAA-390).
// Source the last completion from the eligibility store, which exposes the same shape.
router.get("/metadata/last-elegibilidad", (req, res) => res.json({ countries: eligibilityStore.lastCompleted(req.query.period) }))

// last-prices, last-weighting, last-mtr are registered in server.js
// with access to the actual stores (pricesStore, weightingStore, mtrStore)

export default router

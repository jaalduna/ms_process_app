import { Router } from "express"
import { COUNTRIES, jobs } from "./sync.js"

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

function lastCompletedByStage(stage) {
  const result = {}
  for (const job of jobs.values()) {
    if (job.status !== "completed" || job.stage !== stage) continue
    const prev = result[job.country]
    if (!prev || new Date(job.completed_at) > new Date(prev.completed_at)) {
      result[job.country] = { country: job.country, completed_at: job.completed_at, run_id: job.job_id, period: job.period }
    }
  }
  return result
}

router.get("/metadata/last-sync", (_req, res) => res.json({ countries: lastCompletedByStage("inicio") }))
router.get("/metadata/last-calibration", (_req, res) => res.json({ countries: lastCompletedByStage("calibracion") }))
router.get("/metadata/last-elegibilidad", (_req, res) => res.json({ countries: lastCompletedByStage("elegibilidad") }))

// last-prices, last-weighting, last-mtr are registered in server.js
// with access to the actual stores (pricesStore, weightingStore, mtrStore)

export default router

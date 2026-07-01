import { Router } from "express"

const router = Router()

// In-memory capture so tests / debugging can inspect what the UI sent.
// Bounded so a long-running mock never grows unboundedly.
const MAX_KEPT = 500
export const telemetryStore = {
  events: [],
  errors: [],
  reset() {
    this.events = []
    this.errors = []
  },
}

function keep(bucket, items) {
  for (const item of items) bucket.push(item)
  if (bucket.length > MAX_KEPT) bucket.splice(0, bucket.length - MAX_KEPT)
}

/**
 * POST /api/v1/telemetry/events
 * Usage-analytics batch (session_start/session_end/page_view/interaction).
 * Body: { events: [...] } (array) — accepts a bare array too for resilience.
 * Always 202 {accepted, count}; telemetry must never block the client.
 */
router.post("/telemetry/events", (req, res) => {
  const body = req.body
  const events = Array.isArray(body) ? body : Array.isArray(body?.events) ? body.events : []
  keep(telemetryStore.events, events)
  res.status(202).json({ accepted: true, count: events.length })
})

/**
 * POST /api/v1/telemetry/errors
 * Error/crash reports. Body: { errors: [...] } or a single error object.
 * Always 202 {accepted, count}.
 */
router.post("/telemetry/errors", (req, res) => {
  const body = req.body
  const errors = Array.isArray(body) ? body : Array.isArray(body?.errors) ? body.errors : body ? [body] : []
  keep(telemetryStore.errors, errors)
  res.status(202).json({ accepted: true, count: errors.length })
})

export default router

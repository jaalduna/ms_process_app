import { Router } from "express"

// JAA-644 / JAA-642 — mock of the shared process-config API. Faithful to the
// frozen JAA-642 contract so MtrConfigDialog (and later calibration/prices)
// builds + e2e-tests without the real FastAPI/SQLite backend.
// Base path: /api/v1/config.
//
//   GET /config/processes/{process} -> { process, scope, config, editable }
//   PUT /config/processes/{process} -> body { config: <object> }, upsert,
//                                       returns the same envelope. 422 on a
//                                       non-object config.
//
// Access model (JAA-642): editing requires global `admin` or `{process}:admin`.
// The mock dev/demo user is always `admin`, so `editable` is true here — the
// read-only path is exercised by the vitest/RTL suite where the GET response is
// stubbed directly.

const router = Router()

const KNOWN_PROCESSES = ["prices", "weighting", "mtr", "calibration", "eligibility"]
const SCOPE = "default"

// In-memory store, mirroring the SQLite process_config source of truth on the
// real backend: per process we keep the latest config object + audit fields.
const store = new Map() // process -> { config, updated_at, updated_by }

function getEntry(process) {
  if (!store.has(process)) {
    store.set(process, { config: {}, updated_at: null, updated_by: null })
  }
  return store.get(process)
}

export function seedProcessConfig() {
  // Empty defaults for every known process — the frontend falls back to its own
  // DEFAULT_*_PARAMS when config is `{}`.
  store.clear()
  for (const process of KNOWN_PROCESSES) {
    store.set(process, { config: {}, updated_at: null, updated_by: null })
  }
}

function isPlainObject(v) {
  return v != null && typeof v === "object" && !Array.isArray(v)
}

function envelope(process, entry) {
  return {
    process,
    scope: SCOPE,
    config: entry.config,
    // Mock user is admin → can edit any process.
    editable: true,
  }
}

router.get("/config/processes/:process", (req, res) => {
  const { process } = req.params
  res.json(envelope(process, getEntry(process)))
})

router.put("/config/processes/:process", (req, res) => {
  const { process } = req.params
  const config = req.body?.config
  if (!isPlainObject(config)) {
    return res
      .status(422)
      .json({ error: "validation_error", message: "body.config must be a JSON object" })
  }
  const entry = getEntry(process)
  entry.config = config
  entry.updated_at = new Date().toISOString()
  entry.updated_by = "mock-admin"
  res.json(envelope(process, entry))
})

export default router

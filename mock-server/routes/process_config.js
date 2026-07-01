import { Router } from "express"

// JAA-644 / JAA-642 — mock of the shared process-config API. Faithful to the
// frozen JAA-642 contract so MtrConfigDialog (and later calibration/prices)
// builds + e2e-tests without the real FastAPI/SQLite backend.
// Base path: /api/v1/config.
//
//   GET /config/processes/{process}?scope=<scope> -> { process, scope, config, editable }
//   PUT /config/processes/{process}?scope=<scope> -> body { config: <object> }, upsert,
//                                       returns the same envelope. 422 on a
//                                       non-object config.
//
// JAA-667 — scope support: the real backend keys rows by `(process, scope)`
// (default scope `"default"`). A non-default scope (e.g. a country code) is used
// for per-country calibration `group_by`. This mock mirrors that: the in-memory
// store is keyed by `(process, scope)` and `?scope=` is honored on both verbs.
//
// Access model (JAA-642): editing requires global `admin` or `{process}:admin`.
// The mock dev/demo user is always `admin`, so `editable` is true here — the
// read-only path is exercised by the vitest/RTL suite where the GET response is
// stubbed directly.

const router = Router()

const KNOWN_PROCESSES = ["prices", "weighting", "mtr", "calibration", "eligibility"]
const DEFAULT_SCOPE = "default"

// In-memory store, mirroring the SQLite process_config source of truth on the
// real backend (PK `(process, scope)`): per (process, scope) we keep the latest
// config object + audit fields.
const store = new Map() // `${process}::${scope}` -> { config, updated_at, updated_by }

function key(process, scope) {
  return `${process}::${scope}`
}

function scopeOf(req) {
  const s = req.query?.scope
  return typeof s === "string" && s !== "" ? s : DEFAULT_SCOPE
}

function getEntry(process, scope) {
  const k = key(process, scope)
  if (!store.has(k)) {
    store.set(k, { config: {}, updated_at: null, updated_by: null })
  }
  return store.get(k)
}

export function seedProcessConfig() {
  // Empty defaults for every known process at the default scope — the frontend
  // falls back to its own DEFAULT_*_PARAMS (and DEFAULT_GROUP_BY) when config is `{}`.
  store.clear()
  for (const process of KNOWN_PROCESSES) {
    store.set(key(process, DEFAULT_SCOPE), { config: {}, updated_at: null, updated_by: null })
  }
}

function isPlainObject(v) {
  return v != null && typeof v === "object" && !Array.isArray(v)
}

function envelope(process, scope, entry) {
  return {
    process,
    scope,
    config: entry.config,
    // Mock user is admin → can edit any process.
    editable: true,
  }
}

router.get("/config/processes/:process", (req, res) => {
  const { process } = req.params
  const scope = scopeOf(req)
  res.json(envelope(process, scope, getEntry(process, scope)))
})

router.put("/config/processes/:process", (req, res) => {
  const { process } = req.params
  const scope = scopeOf(req)
  const config = req.body?.config
  if (!isPlainObject(config)) {
    return res
      .status(422)
      .json({ error: "validation_error", message: "body.config must be a JSON object" })
  }
  const entry = getEntry(process, scope)
  entry.config = config
  entry.updated_at = new Date().toISOString()
  entry.updated_by = "mock-admin"
  res.json(envelope(process, scope, entry))
})

export default router

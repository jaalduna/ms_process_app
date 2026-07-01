import { Router } from "express"
import { COUNTRIES } from "./sync.js"
import { verifyAppToken } from "./auth.js"
import { ProcessStateStore } from "../stores/process-store.js"

const router = Router()

export const processStore = new ProcessStateStore()

const VALID_COUNTRIES = new Set(COUNTRIES.map((c) => c.code))
const VALID_STAGES = new Set(["precios", "elegibilidad", "pesaje", "calibracion", "mtr", "formato4"])

const STATUS_LABELS = { open: "abierto", closed: "cerrado" }

/**
 * Resolve the acting user from the Authorization header.
 * Mirrors the /auth/me logic: real JWT → claims; dev bypass / no token → mock user.
 */
function requestUser(req) {
  const authHeader = req.headers.authorization ?? ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null
  if (token && token !== "dev-bypass-token") {
    const claims = verifyAppToken(token)
    if (claims) return { name: claims.name, email: claims.email }
    return null
  }
  return { name: "Dev User", email: "dev@localhost" }
}

router.get("/processes/status", (_req, res) => {
  res.json({ countries: processStore.getAll() })
})

function setStatusHandler(status) {
  return (req, res) => {
    const { stage, country } = req.params
    if (!VALID_STAGES.has(stage)) {
      return res.status(404).json({ error: "not_found", message: `Stage ${stage} not found` })
    }
    if (!VALID_COUNTRIES.has(country)) {
      return res.status(404).json({ error: "not_found", message: `Country ${country} not found` })
    }
    const user = requestUser(req)
    if (!user) {
      return res.status(401).json({ error: "invalid_token", message: "JWT verification failed" })
    }
    const { conflict, entry } = processStore.setStatus(stage, country, status, user)
    if (conflict) {
      return res.status(409).json({
        error: "conflict",
        message: `El proceso de ${stage} de ${country} ya estaba ${STATUS_LABELS[status]}`,
      })
    }
    res.json(entry)
  }
}

router.post("/processes/:stage/:country/open", setStatusHandler("open"))
router.post("/processes/:stage/:country/close", setStatusHandler("closed"))

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

export function seedProcesses() {
  // Every stage+country starts "open" (in progress / editable) by default.
  for (const stage of VALID_STAGES) {
    for (const c of COUNTRIES) processStore.ensure(stage, c.code)
  }

  const maria = { name: "Maria Gonzalez", email: "maria.gonzalez@kantar.com" }
  const carlos = { name: "Carlos Pereira", email: "carlos.pereira@kantar.com" }

  // Closed examples — closing records attribution (changed_by/_at), so these
  // demo the locked state + "cerrado por …" line and the disabled-trigger gate.
  processStore.setStatus("precios", "colombia", "closed", carlos)
  processStore.setStatus("elegibilidad", "brasil", "closed", maria)
  // Open-with-attribution — close then reopen so an open process also shows
  // "abierto por …" (a plain default-open process has no attribution yet).
  processStore.setStatus("precios", "argentina", "closed", maria)
  processStore.setStatus("precios", "argentina", "open", maria)
}

export default router

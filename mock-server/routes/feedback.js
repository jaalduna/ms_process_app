import { Router } from "express"
import { verifyAppToken } from "./auth.js"

const router = Router()

// In-memory store of submitted feedback (mock only; cleared on restart).
export const feedbackStore = []

let seq = 0
function nextTicketNumber() {
  seq += 1
  return `FB-${seq.toString().padStart(6, "0")}`
}

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

function toPublicTicket(entry) {
  return {
    ticket_number: entry.ticket_number,
    message: entry.message,
    category: entry.category,
    status: entry.status,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
  }
}

// ---------------------------------------------------------------------------
// POST /feedback — accept in-app user feedback (JAA-427 / parent JAA-426;
// tickets contract JAA-768/JAA-769)
//   body: { message (required), category?, contact?, context? }
//   201  { ticket_number, status, created_at }
//   400  message vacío
// ---------------------------------------------------------------------------

router.post("/feedback", (req, res) => {
  const { message, category, contact, context } = req.body ?? {}

  if (typeof message !== "string" || message.trim() === "") {
    return res.status(400).json({ error: "bad_request", message: "message is required" })
  }

  const now = new Date().toISOString()
  const entry = {
    ticket_number: nextTicketNumber(),
    message: message.trim(),
    category: category ?? null,
    contact: contact ?? null,
    context: context ?? null,
    status: "todo",
    email: requestUser(req).email,
    created_at: now,
    updated_at: now,
  }
  feedbackStore.push(entry)

  res.status(201).json({
    ticket_number: entry.ticket_number,
    status: entry.status,
    created_at: entry.created_at,
  })
})

// ---------------------------------------------------------------------------
// GET /feedback/mine — list the acting user's own tickets, newest first.
// ---------------------------------------------------------------------------

router.get("/feedback/mine", (req, res) => {
  const user = requestUser(req)
  if (!user) {
    return res.status(401).json({ error: "invalid_token", message: "JWT verification failed" })
  }

  const tickets = feedbackStore
    .filter((entry) => entry.email === user.email)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map(toPublicTicket)

  res.json({ tickets })
})

// ---------------------------------------------------------------------------
// GET /feedback/:ticket_number — fetch a single owned ticket. No existence
// leak to non-owners: unknown ticket AND someone else's ticket both 404.
// ---------------------------------------------------------------------------

router.get("/feedback/:ticket_number", (req, res) => {
  const user = requestUser(req)
  if (!user) {
    return res.status(401).json({ error: "invalid_token", message: "JWT verification failed" })
  }

  const entry = feedbackStore.find((e) => e.ticket_number === req.params.ticket_number)
  if (!entry || entry.email !== user.email) {
    return res.status(404).json({ error: "not_found", message: "Ticket not found" })
  }

  res.json(toPublicTicket(entry))
})

export function reset() {
  feedbackStore.length = 0
  seq = 0
}

export default router

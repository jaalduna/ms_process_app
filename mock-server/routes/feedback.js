import { Router } from "express"

const router = Router()

// In-memory store of submitted feedback (mock only; cleared on restart).
export const feedbackStore = []

let seq = 0
function nextId() {
  seq += 1
  return `fb_${seq.toString().padStart(6, "0")}`
}

// ---------------------------------------------------------------------------
// POST /feedback — accept in-app user feedback (JAA-427 / parent JAA-426)
//   body: { message (required), category, contact?, context? }
//   201  { id, createdAt }
//   400  message vacío
// ---------------------------------------------------------------------------

router.post("/feedback", (req, res) => {
  const { message, category, contact, context } = req.body ?? {}

  if (typeof message !== "string" || message.trim() === "") {
    return res.status(400).json({ error: "bad_request", message: "message is required" })
  }

  const entry = {
    id: nextId(),
    message: message.trim(),
    category: category ?? "otro",
    contact: contact ?? null,
    context: context ?? null,
    createdAt: new Date().toISOString(),
  }
  feedbackStore.push(entry)

  res.status(201).json({ id: entry.id, createdAt: entry.createdAt })
})

export default router

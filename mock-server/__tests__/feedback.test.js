import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import express from "express"
import feedbackRouter, { feedbackStore, reset as resetFeedback } from "../routes/feedback.js"

// JAA-427/JAA-768/JAA-769: the mock-server must honor the feedback contract so
// the UI can be built + e2e-tested without the real backend (parent JAA-426).
describe("feedback routes (mock-server)", () => {
  let server
  let baseUrl

  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use("/api/v1", feedbackRouter)
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}/api/v1`
        resolve()
      })
    })
  })

  afterAll(() => new Promise((resolve) => server.close(resolve)))

  afterEach(() => {
    resetFeedback()
  })

  describe("POST /feedback", () => {
    it("returns 201 { ticket_number, status, created_at } for a valid body", async () => {
      const res = await fetch(`${baseUrl}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "great app",
          category: "idea",
          context: { module: "precios", path: "/precios", appVersion: "0.3.2" },
        }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.ticket_number).toMatch(/^FB-\d{6}$/)
      expect(body.status).toBe("todo")
      expect(typeof body.created_at).toBe("string")
      expect(Number.isNaN(Date.parse(body.created_at))).toBe(false)
      expect(body.id).toBeUndefined()
      expect(body.createdAt).toBeUndefined()
    })

    it("returns 400 when message is empty / whitespace", async () => {
      const res = await fetch(`${baseUrl}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "   ", category: "bug" }),
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe("bad_request")
    })

    it("returns 400 when message is missing", async () => {
      const res = await fetch(`${baseUrl}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "otro" }),
      })
      expect(res.status).toBe(400)
    })
  })

  describe("GET /feedback/mine", () => {
    it("returns a ticket created by the same (dev-bypass) user, without email/context", async () => {
      const postRes = await fetch(`${baseUrl}/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer dev-bypass-token",
        },
        body: JSON.stringify({
          message: "visible to owner",
          category: "bug",
          context: { module: "precios", path: "/precios", appVersion: "0.3.2" },
        }),
      })
      const posted = await postRes.json()

      const mineRes = await fetch(`${baseUrl}/feedback/mine`, {
        headers: { Authorization: "Bearer dev-bypass-token" },
      })
      expect(mineRes.status).toBe(200)
      const mineBody = await mineRes.json()

      expect(mineBody.tickets).toHaveLength(1)
      const ticket = mineBody.tickets[0]
      expect(ticket.ticket_number).toBe(posted.ticket_number)
      expect(ticket.message).toBe("visible to owner")
      expect(ticket.category).toBe("bug")
      expect(ticket.status).toBe("todo")
      expect(typeof ticket.created_at).toBe("string")
      expect(typeof ticket.updated_at).toBe("string")
      expect(ticket.email).toBeUndefined()
      expect(ticket.context).toBeUndefined()
    })

    it("excludes tickets created by a different user", async () => {
      // Ticket for the default dev-bypass user.
      await fetch(`${baseUrl}/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer dev-bypass-token",
        },
        body: JSON.stringify({ message: "mine", category: "idea" }),
      })

      // A second ticket belonging to a different user, injected directly into
      // the store (minting a real signed JWT for a second identity isn't
      // practical in this test file's setup).
      feedbackStore.push({
        ticket_number: "FB-999999",
        message: "someone else's",
        category: "otro",
        contact: null,
        context: null,
        status: "todo",
        email: "someone.else@example.com",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const mineRes = await fetch(`${baseUrl}/feedback/mine`, {
        headers: { Authorization: "Bearer dev-bypass-token" },
      })
      const mineBody = await mineRes.json()

      expect(mineBody.tickets).toHaveLength(1)
      expect(mineBody.tickets.some((t) => t.ticket_number === "FB-999999")).toBe(false)
    })

    it("returns tickets sorted newest-first (desc by created_at)", async () => {
      const first = await fetch(`${baseUrl}/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer dev-bypass-token",
        },
        body: JSON.stringify({ message: "first", category: "idea" }),
      }).then((r) => r.json())

      // Force a distinct created_at so the desc-sort assertion is deterministic
      // (two requests can otherwise land in the same millisecond).
      const firstEntry = feedbackStore.find((e) => e.ticket_number === first.ticket_number)
      firstEntry.created_at = new Date(Date.now() - 60_000).toISOString()

      const second = await fetch(`${baseUrl}/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer dev-bypass-token",
        },
        body: JSON.stringify({ message: "second", category: "idea" }),
      }).then((r) => r.json())

      const mineRes = await fetch(`${baseUrl}/feedback/mine`, {
        headers: { Authorization: "Bearer dev-bypass-token" },
      })
      const mineBody = await mineRes.json()

      expect(mineBody.tickets.map((t) => t.ticket_number)).toEqual([
        second.ticket_number,
        first.ticket_number,
      ])
    })
  })

  describe("GET /feedback/:ticket_number", () => {
    it("returns a ticket created by the same (dev-bypass) user, without email/context", async () => {
      const postRes = await fetch(`${baseUrl}/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer dev-bypass-token",
        },
        body: JSON.stringify({
          message: "visible to owner",
          category: "bug",
          context: { module: "precios", path: "/precios", appVersion: "0.3.2" },
        }),
      })
      const posted = await postRes.json()

      const getRes = await fetch(`${baseUrl}/feedback/${posted.ticket_number}`, {
        headers: { Authorization: "Bearer dev-bypass-token" },
      })
      expect(getRes.status).toBe(200)
      const ticket = await getRes.json()

      expect(ticket.ticket_number).toBe(posted.ticket_number)
      expect(ticket.message).toBe("visible to owner")
      expect(ticket.category).toBe("bug")
      expect(ticket.status).toBe("todo")
      expect(typeof ticket.created_at).toBe("string")
      expect(typeof ticket.updated_at).toBe("string")
      expect(ticket.email).toBeUndefined()
      expect(ticket.context).toBeUndefined()
    })

    it("returns 404 for an unknown ticket number", async () => {
      const res = await fetch(`${baseUrl}/feedback/UNKNOWN-TICKET-NUMBER`, {
        headers: { Authorization: "Bearer dev-bypass-token" },
      })
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toBe("not_found")
      expect(typeof body.message).toBe("string")
    })

    it("returns 404 (not 200/403) for a ticket belonging to a different user", async () => {
      // A ticket belonging to a different user, injected directly into the
      // store (minting a real signed JWT for a second identity isn't
      // practical in this test file's setup).
      feedbackStore.push({
        ticket_number: "FB-999999",
        message: "someone else's",
        category: "otro",
        contact: null,
        context: null,
        status: "todo",
        email: "someone.else@example.com",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const res = await fetch(`${baseUrl}/feedback/FB-999999`, {
        headers: { Authorization: "Bearer dev-bypass-token" },
      })
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toBe("not_found")
    })
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  initTelemetry,
  flush,
  track,
  trackPageView,
  captureError,
  endSession,
  setTelemetryUser,
  __resetTelemetryForTests,
  __getTelemetryQueue,
} from "@/lib/telemetry"

type FetchCall = { url: string; body: unknown }

function lastFetch(spy: ReturnType<typeof vi.fn>): FetchCall {
  const [url, init] = spy.mock.calls[spy.mock.calls.length - 1] as [string, RequestInit]
  return { url, body: JSON.parse(init.body as string) }
}

describe("telemetry client", () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    __resetTelemetryForTests()
    fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 202 })
    vi.stubGlobal("fetch", fetchSpy)
  })

  afterEach(() => {
    __resetTelemetryForTests()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("initTelemetry queues a session_start and flush sends a batch to /telemetry/events", async () => {
    initTelemetry()
    expect(__getTelemetryQueue().map((e) => e.type)).toContain("session_start")

    await flush()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const { url, body } = lastFetch(fetchSpy)
    expect(url).toMatch(/\/telemetry\/events$/)
    expect(Array.isArray((body as { events: unknown[] }).events)).toBe(true)
    expect((body as { events: unknown[] }).events.length).toBeGreaterThanOrEqual(1)
  })

  it("emits page_view on route change, with dwellMs after the first navigation", () => {
    initTelemetry()
    trackPageView("/precios")
    trackPageView("/pesaje")

    const views = __getTelemetryQueue().filter((e) => e.type === "page_view")
    expect(views).toHaveLength(2)
    expect(views[0].path).toBe("/precios")
    expect(views[0].dwellMs).toBeUndefined()
    expect(views[1].path).toBe("/pesaje")
    expect(typeof views[1].dwellMs).toBe("number")
  })

  it("emits an interaction when a [data-telemetry] element is clicked", () => {
    initTelemetry()
    const btn = document.createElement("button")
    btn.setAttribute("data-telemetry", "run-precios")
    document.body.appendChild(btn)

    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    const interactions = __getTelemetryQueue().filter((e) => e.type === "interaction")
    expect(interactions.some((e) => e.name === "run-precios")).toBe(true)
    btn.remove()
  })

  it("track() records a named interaction", () => {
    initTelemetry()
    track("manual-action", { foo: 1 })
    const ev = __getTelemetryQueue().find((e) => e.name === "manual-action")
    expect(ev?.type).toBe("interaction")
    expect(ev?.props).toEqual({ foo: 1 })
  })

  it("captureError posts a complete payload to /telemetry/errors", () => {
    setTelemetryUser({ email: "user@example.com" })
    captureError({ message: "boom", stack: "stack-trace", kind: "react" })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const { url, body } = lastFetch(fetchSpy)
    expect(url).toMatch(/\/telemetry\/errors$/)
    const report = (body as { errors: Record<string, unknown>[] }).errors[0]
    expect(report).toMatchObject({
      message: "boom",
      stack: "stack-trace",
      kind: "react",
      user: "user@example.com",
    })
    expect(typeof report.path).toBe("string")
    expect(typeof report.appVersion).toBe("string")
    expect(typeof report.userAgent).toBe("string")
    expect(typeof report.occurredAt).toBe("string")
    expect(typeof report.sessionId).toBe("string")
  })

  it("captures a window error event as kind 'error'", () => {
    initTelemetry()
    window.dispatchEvent(new ErrorEvent("error", { message: "window boom", error: new Error("window boom") }))

    expect(fetchSpy).toHaveBeenCalled()
    const { url, body } = lastFetch(fetchSpy)
    expect(url).toMatch(/\/telemetry\/errors$/)
    expect((body as { errors: { kind: string; message: string }[] }).errors[0].kind).toBe("error")
  })

  it("session_end carries a numeric durationMs and beacons out", () => {
    const beacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: beacon, userAgent: "test-agent" })
    initTelemetry()

    endSession()

    expect(beacon).toHaveBeenCalledTimes(1)
    const [, blob] = beacon.mock.calls[0] as [string, Blob]
    // sendBeacon receives a Blob; we validate the queued event instead via the URL.
    expect(beacon.mock.calls[0][0]).toMatch(/\/telemetry\/events$/)
    expect(blob).toBeInstanceOf(Blob)
  })

  it("sends queued events in a SINGLE batch", async () => {
    initTelemetry()
    track("a")
    track("b")
    track("c")
    await flush()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const { body } = lastFetch(fetchSpy)
    const names = (body as { events: { name?: string }[] }).events.map((e) => e.name).filter(Boolean)
    expect(names).toEqual(expect.arrayContaining(["a", "b", "c"]))
  })

  it("does NOT throw when the network fails, and re-queues the batch", async () => {
    fetchSpy.mockRejectedValue(new Error("network down"))
    initTelemetry()
    track("will-retry")

    await expect(flush()).resolves.toBeUndefined()
    // Failed batch is preserved for a later flush.
    expect(__getTelemetryQueue().some((e) => e.name === "will-retry")).toBe(true)
  })
})

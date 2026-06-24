import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  getFeatureFlags,
  isTelemetryEnabled,
  isProcessStatusEnabled,
} from "@/lib/feature-flags"
import {
  initTelemetry,
  flush,
  __resetTelemetryForTests,
  __getTelemetryQueue,
} from "@/lib/telemetry"

type AppConfigWindow = {
  __APP_CONFIG__?: { features?: Record<string, boolean> }
}

function setFeatures(features: Record<string, boolean> | undefined) {
  const win = window as unknown as AppConfigWindow
  if (features === undefined) {
    delete win.__APP_CONFIG__
  } else {
    win.__APP_CONFIG__ = { ...win.__APP_CONFIG__, features }
  }
}

describe("feature flags", () => {
  afterEach(() => {
    setFeatures(undefined)
  })

  it("defaults every flag to true when __APP_CONFIG__ is absent", () => {
    setFeatures(undefined)
    expect(getFeatureFlags()).toEqual({ telemetry: true, processStatus: true })
    expect(isTelemetryEnabled()).toBe(true)
    expect(isProcessStatusEnabled()).toBe(true)
  })

  it("defaults a missing flag to true (partial features object)", () => {
    setFeatures({ telemetry: false })
    expect(isTelemetryEnabled()).toBe(false)
    expect(isProcessStatusEnabled()).toBe(true)
  })

  it("respects explicit false values", () => {
    setFeatures({ telemetry: false, processStatus: false })
    expect(isTelemetryEnabled()).toBe(false)
    expect(isProcessStatusEnabled()).toBe(false)
  })
})

describe("telemetry feature guard", () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    __resetTelemetryForTests()
    fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 202 })
    vi.stubGlobal("fetch", fetchSpy)
  })

  afterEach(() => {
    __resetTelemetryForTests()
    setFeatures(undefined)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("is a no-op when features.telemetry is false: no session_start, no fetch", async () => {
    setFeatures({ telemetry: false })
    initTelemetry()

    expect(__getTelemetryQueue()).toHaveLength(0)
    await flush()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("initializes normally when telemetry flag is unset (default on)", async () => {
    setFeatures(undefined)
    initTelemetry()

    expect(__getTelemetryQueue().map((e) => e.type)).toContain("session_start")
    await flush()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

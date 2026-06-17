import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RunStore } from "../stores/run-store.js"

/**
 * JAA-393: the per-step cadence of RunStore.execute() must be driven by the
 * MOCK_STEP_INTERVAL_MS env var (with a 2000ms fallback) so e2e can run the
 * mock state machine fast without changing product behavior.
 */
describe("RunStore step cadence is env-configurable (MOCK_STEP_INTERVAL_MS)", () => {
  const ORIG = process.env.MOCK_STEP_INTERVAL_MS

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    if (ORIG === undefined) delete process.env.MOCK_STEP_INTERVAL_MS
    else process.env.MOCK_STEP_INTERVAL_MS = ORIG
  })

  it("advances exactly one step per MOCK_STEP_INTERVAL_MS", () => {
    process.env.MOCK_STEP_INTERVAL_MS = "100"
    const store = new RunStore("test")
    store.setDeterministic(true) // no random failures
    const run = store.create("AR", 202401, ["s1", "s2", "s3"])

    store.execute(run.run_id) // interval defaults to env (100ms)

    // First step starts running immediately, nothing has advanced yet.
    expect(run.steps[0].status).toBe("running")
    expect(run.steps[1].status).toBe("pending")

    // Just before the interval elapses, still on step 0.
    vi.advanceTimersByTime(99)
    expect(run.steps[0].status).toBe("running")

    // One full interval -> step 0 completes, step 1 runs.
    vi.advanceTimersByTime(1)
    expect(run.steps[0].status).toBe("completed")
    expect(run.steps[1].status).toBe("running")

    // Two more intervals -> run completes.
    vi.advanceTimersByTime(200)
    expect(run.steps[2].status).toBe("completed")
    expect(run.status).toBe("completed")
  })

  it("falls back to the 2000ms default when the env var is unset", () => {
    delete process.env.MOCK_STEP_INTERVAL_MS
    const store = new RunStore("test")
    store.setDeterministic(true)
    const run = store.create("AR", 202401, ["s1", "s2"])

    store.execute(run.run_id)

    // At 100ms (the fast e2e cadence) nothing advances: default is 2000ms.
    vi.advanceTimersByTime(100)
    expect(run.steps[0].status).toBe("running")

    // After a full 2000ms interval the first step completes.
    vi.advanceTimersByTime(1900)
    expect(run.steps[0].status).toBe("completed")
    expect(run.steps[1].status).toBe("running")
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, act } from "@testing-library/react"
import { formatDuration, LiveDuration } from "@/lib/duration"

describe("formatDuration", () => {
  it("returns '-' when there is no start", () => {
    expect(formatDuration(null, null)).toBe("-")
    expect(formatDuration(undefined, undefined)).toBe("-")
  })

  it("formats sub-minute durations as seconds", () => {
    const start = "2026-01-01T00:00:00Z"
    const end = "2026-01-01T00:00:45Z"
    expect(formatDuration(start, end)).toBe("45s")
  })

  it("formats sub-hour durations as minutes and seconds", () => {
    const start = "2026-01-01T00:00:00Z"
    const end = "2026-01-01T00:05:30Z"
    expect(formatDuration(start, end)).toBe("5m 30s")
  })

  it("formats durations over an hour as hours and minutes", () => {
    const start = "2026-01-01T00:00:00Z"
    const end = "2026-01-01T02:15:40Z"
    expect(formatDuration(start, end)).toBe("2h 15m")
  })

  it("uses the provided `now` when end is null (in-progress run)", () => {
    const start = "2026-01-01T00:00:00Z"
    const now = new Date("2026-01-01T00:00:10Z").getTime()
    expect(formatDuration(start, null, now)).toBe("10s")
  })
})

describe("LiveDuration", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("ticks every second while the run is in progress, without any external re-render", async () => {
    render(<LiveDuration start="2026-01-01T00:00:00Z" end={null} />)
    expect(screen.getByText("0s")).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(3000)
    })

    expect(screen.getByText("3s")).toBeInTheDocument()
  })

  it("does not tick once end is set (no interval left running)", async () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval")
    render(<LiveDuration start="2026-01-01T00:00:00Z" end="2026-01-01T00:00:05Z" />)
    expect(screen.getByText("5s")).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })

    expect(screen.getByText("5s")).toBeInTheDocument()
    expect(setIntervalSpy).not.toHaveBeenCalled()
  })

  it("clears its interval on unmount", async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval")
    const { unmount } = render(<LiveDuration start="2026-01-01T00:00:00Z" end={null} />)
    unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
  })
})

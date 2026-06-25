import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"

// Map-backed localStorage stub (the test env does not provide one natively).
function installLocalStorageStub() {
  const store = new Map<string, string>()
  const mock: Storage = {
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size
    },
  }
  vi.stubGlobal("localStorage", mock)
}
installLocalStorageStub()

const mockGetCalibrationRuns = vi.fn()
const mockGetEvent = vi.fn()
const mockTriggerCalibration = vi.fn()
const mockCancelJob = vi.fn()

vi.mock("@/lib/api", () => ({
  getCalibrationRuns: (...args: unknown[]) => mockGetCalibrationRuns(...args),
  getEvent: (...args: unknown[]) => mockGetEvent(...args),
  triggerCalibration: (...args: unknown[]) => mockTriggerCalibration(...args),
  cancelJob: (...args: unknown[]) => mockCancelJob(...args),
}))

import { useCalibration } from "@/modules/calibracion/hooks/useCalibration"

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function runSummary(overrides: Record<string, unknown> = {}) {
  return {
    job_id: "run-backend-1",
    status: "running",
    country: "mexico",
    stage: "calibracion",
    tag: "mexico-calibracion-1",
    period: "202601",
    queries_total: 2,
    queries_completed: 1,
    queries_failed: 0,
    created_at: "2026-06-01T10:00:00Z",
    started_at: "2026-06-01T10:00:01Z",
    completed_at: null,
    triggered_by: "calibration-app",
    error: null,
    current_query: null,
    failed_queries: [],
    running_queries: [],
    queries_running: 0,
    total_rows_extracted: 0,
    steps: [],
    current_step: "merge_data",
    ...overrides,
  }
}

describe("useCalibration — server-authoritative active run (JAA-648)", () => {
  beforeEach(() => {
    mockGetCalibrationRuns.mockReset()
    mockGetEvent.mockReset()
    mockTriggerCalibration.mockReset()
    mockCancelJob.mockReset()
    localStorage.clear()
  })

  it("derives the active run from the backend listing (items[0]), not from localStorage", async () => {
    // A stale legacy localStorage entry points at a different job id — it must be ignored.
    localStorage.setItem(
      "bridge:calibration-job-ids",
      JSON.stringify({ mexico: "stale-localstorage-999" }),
    )
    mockGetCalibrationRuns.mockResolvedValue({
      items: [runSummary()],
      total: 1,
      limit: 50,
      offset: 0,
    })
    mockGetEvent.mockResolvedValue({ ...runSummary(), results: [] })

    const { result } = renderHook(
      () => useCalibration("mexico", "calibracion", "202601"),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.activeJobId).toBe("run-backend-1"))
    // The list endpoint was queried with the country+period filter.
    expect(mockGetCalibrationRuns).toHaveBeenCalledWith({
      country: "mexico",
      period: "202601",
    })
    // The detail came from the backend job id, NOT the stale localStorage value.
    await waitFor(() => expect(result.current.job?.status).toBe("running"))
    expect(mockGetEvent).toHaveBeenCalledWith("run-backend-1")
    expect(mockGetEvent).not.toHaveBeenCalledWith("stale-localstorage-999")
  })

  it("has no active run when the backend listing is empty (ignores localStorage)", async () => {
    localStorage.setItem(
      "bridge:calibration-job-ids",
      JSON.stringify({ mexico: "stale-localstorage-999" }),
    )
    mockGetCalibrationRuns.mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 })

    const { result } = renderHook(
      () => useCalibration("mexico", "calibracion", "202601"),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(mockGetCalibrationRuns).toHaveBeenCalled())
    expect(result.current.activeJobId).toBeNull()
    expect(mockGetEvent).not.toHaveBeenCalled()
  })

  it("invalidates the backend listing after triggering (no localStorage write)", async () => {
    mockGetCalibrationRuns
      .mockResolvedValueOnce({ items: [], total: 0, limit: 50, offset: 0 })
      .mockResolvedValue({ items: [runSummary()], total: 1, limit: 50, offset: 0 })
    mockGetEvent.mockResolvedValue({ ...runSummary(), results: [] })
    mockTriggerCalibration.mockResolvedValue({ job_id: "run-backend-1", status: "pending" })

    const { result } = renderHook(
      () => useCalibration("mexico", "calibracion", "202601"),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(mockGetCalibrationRuns).toHaveBeenCalled())
    await result.current.startCalibration({ period: "202601", skip_sync: true })

    expect(mockTriggerCalibration).toHaveBeenCalledWith(
      expect.objectContaining({ country: "mexico", stage: "calibracion", period: "202601" }),
    )
    // Active run is re-derived from the backend, not persisted to localStorage.
    expect(localStorage.getItem("bridge:calibration-job-ids")).toBeNull()
    await waitFor(() => expect(result.current.activeJobId).toBe("run-backend-1"))
  })
})

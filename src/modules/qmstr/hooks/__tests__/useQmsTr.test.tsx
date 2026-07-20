import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"

const mockGetQmsTrRuns = vi.fn()
const mockGetQmsTrRun = vi.fn()
const mockCreateQmsTrRun = vi.fn()

vi.mock("@/lib/api", () => ({
  getQmsTrRuns: (...a: unknown[]) => mockGetQmsTrRuns(...a),
  getQmsTrRun: (...a: unknown[]) => mockGetQmsTrRun(...a),
  createQmsTrRun: (...a: unknown[]) => mockCreateQmsTrRun(...a),
}))

import { useQmsTrRuns, useQmsTrHistory, useQmsTrRun, useCreateQmsTrRun } from "../useQmsTr"

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

const RUN = (status: string) => ({
  job_id: "j1",
  country: "brasil",
  ano_base: 2026,
  status,
  steps: [{ name: "silver_builder", status: "completed" }, { name: "kpis_batch", status }],
  created_at: "2026-07-20T00:00:00Z",
  updated_at: "2026-07-20T00:00:00Z",
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("useQmsTrRuns", () => {
  it("returns the items array on success, forwarding country/ano_base", async () => {
    mockGetQmsTrRuns.mockResolvedValue({ items: [RUN("completed")], total: 1 })
    const { result } = renderHook(() => useQmsTrRuns("brasil", 2026), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([RUN("completed")])
    expect(mockGetQmsTrRuns).toHaveBeenCalledWith({ country: "brasil", ano_base: 2026 })
  })
})

describe("useQmsTrRuns polling (3000ms while active, stops when terminal)", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("re-fetches after 3000ms while a job is pending/running", async () => {
    mockGetQmsTrRuns.mockResolvedValue({ items: [RUN("running")], total: 1 })
    renderHook(() => useQmsTrRuns("brasil"), { wrapper: createWrapper() })
    await vi.advanceTimersByTimeAsync(0)
    expect(mockGetQmsTrRuns).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(mockGetQmsTrRuns).toHaveBeenCalledTimes(2)
  })

  it("does NOT re-fetch when all jobs are terminal", async () => {
    mockGetQmsTrRuns.mockResolvedValue({ items: [RUN("completed")], total: 1 })
    renderHook(() => useQmsTrRuns("brasil"), { wrapper: createWrapper() })
    await vi.advanceTimersByTimeAsync(0)
    expect(mockGetQmsTrRuns).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(6000)
    expect(mockGetQmsTrRuns).toHaveBeenCalledTimes(1)
  })
})

describe("useQmsTrHistory", () => {
  it("is disabled until enabled=true", async () => {
    const { result } = renderHook(() => useQmsTrHistory("brasil", false), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"))
    expect(mockGetQmsTrRuns).not.toHaveBeenCalled()
  })

  it("fetches with limit 50 when enabled", async () => {
    mockGetQmsTrRuns.mockResolvedValue({ items: [], total: 0 })
    renderHook(() => useQmsTrHistory("brasil", true), { wrapper: createWrapper() })
    await waitFor(() => expect(mockGetQmsTrRuns).toHaveBeenCalledWith({ country: "brasil", limit: 50 }))
  })
})

describe("useQmsTrRun", () => {
  it("is disabled when jobId is null", async () => {
    const { result } = renderHook(() => useQmsTrRun(null), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"))
    expect(mockGetQmsTrRun).not.toHaveBeenCalled()
  })

  it("fetches the job when jobId is provided", async () => {
    mockGetQmsTrRun.mockResolvedValue(RUN("completed"))
    const { result } = renderHook(() => useQmsTrRun("j1"), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockGetQmsTrRun).toHaveBeenCalledWith("j1")
  })
})

describe("useCreateQmsTrRun", () => {
  it("calls createQmsTrRun with the body (create == start, no separate execute call)", async () => {
    mockCreateQmsTrRun.mockResolvedValue(RUN("running"))
    const { result } = renderHook(() => useCreateQmsTrRun(), { wrapper: createWrapper() })
    await act(async () => {
      await result.current.mutateAsync({ country: "brasil", ano_base: 2026 })
    })
    expect(mockCreateQmsTrRun).toHaveBeenCalledWith({ country: "brasil", ano_base: 2026 })
  })
})

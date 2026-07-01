import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"

const mockGetFormato4Runs = vi.fn()
const mockGetFormato4Run = vi.fn()
const mockCreateFormato4Run = vi.fn()
const mockExecuteFormato4 = vi.fn()
const mockCancelFormato4 = vi.fn()
const mockGetLastFormato4 = vi.fn()

vi.mock("@/lib/api", () => ({
  getFormato4Runs: (...a: unknown[]) => mockGetFormato4Runs(...a),
  getFormato4Run: (...a: unknown[]) => mockGetFormato4Run(...a),
  createFormato4Run: (...a: unknown[]) => mockCreateFormato4Run(...a),
  executeFormato4: (...a: unknown[]) => mockExecuteFormato4(...a),
  cancelFormato4: (...a: unknown[]) => mockCancelFormato4(...a),
  getLastFormato4: (...a: unknown[]) => mockGetLastFormato4(...a),
}))

import {
  useFormato4Runs,
  useFormato4Run,
  useCreateFormato4Run,
  useExecuteFormato4,
  useCancelFormato4,
} from "../useFormato4"
import { useLastFormato4 } from "../useLastFormato4"

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

const RUN = (status: string) => ({
  run_id: "r1",
  country: "chile",
  period: 202602,
  status,
  created_at: "2026-06-24T00:00:00Z",
  updated_at: "2026-06-24T00:00:00Z",
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("useFormato4Runs", () => {
  it("returns the items array on success", async () => {
    mockGetFormato4Runs.mockResolvedValue({ items: [RUN("completed")], total: 1 })
    const { result } = renderHook(() => useFormato4Runs("chile"), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([RUN("completed")])
    expect(mockGetFormato4Runs).toHaveBeenCalledWith({ country: "chile", period: undefined })
  })
})

describe("useFormato4Runs polling (3000ms while active, stops when terminal)", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("re-fetches after 3000ms while a run is pending/running", async () => {
    mockGetFormato4Runs.mockResolvedValue({ items: [RUN("running")], total: 1 })
    renderHook(() => useFormato4Runs("chile"), { wrapper: createWrapper() })
    await vi.advanceTimersByTimeAsync(0)
    expect(mockGetFormato4Runs).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(mockGetFormato4Runs).toHaveBeenCalledTimes(2)
  })

  it("does NOT re-fetch when all runs are terminal", async () => {
    mockGetFormato4Runs.mockResolvedValue({ items: [RUN("completed")], total: 1 })
    renderHook(() => useFormato4Runs("chile"), { wrapper: createWrapper() })
    await vi.advanceTimersByTimeAsync(0)
    expect(mockGetFormato4Runs).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(6000)
    expect(mockGetFormato4Runs).toHaveBeenCalledTimes(1)
  })
})

describe("useFormato4Run", () => {
  it("is disabled when runId is null", async () => {
    const { result } = renderHook(() => useFormato4Run(null), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"))
    expect(mockGetFormato4Run).not.toHaveBeenCalled()
  })

  it("fetches the run when runId is provided", async () => {
    mockGetFormato4Run.mockResolvedValue(RUN("completed"))
    const { result } = renderHook(() => useFormato4Run("r1"), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockGetFormato4Run).toHaveBeenCalledWith("r1")
  })
})

describe("mutations", () => {
  it("useCreateFormato4Run calls createFormato4Run", async () => {
    mockCreateFormato4Run.mockResolvedValue(RUN("pending"))
    const { result } = renderHook(() => useCreateFormato4Run(), { wrapper: createWrapper() })
    await act(async () => {
      await result.current.mutateAsync({ country: "chile", period: 202602 })
    })
    expect(mockCreateFormato4Run).toHaveBeenCalledWith({ country: "chile", period: 202602 })
  })

  it("useExecuteFormato4 calls executeFormato4", async () => {
    mockExecuteFormato4.mockResolvedValue(RUN("running"))
    const { result } = renderHook(() => useExecuteFormato4(), { wrapper: createWrapper() })
    await act(async () => {
      await result.current.mutateAsync("r1")
    })
    expect(mockExecuteFormato4).toHaveBeenCalledWith("r1")
  })

  it("useCancelFormato4 calls cancelFormato4", async () => {
    mockCancelFormato4.mockResolvedValue(RUN("cancelled"))
    const { result } = renderHook(() => useCancelFormato4(), { wrapper: createWrapper() })
    await act(async () => {
      await result.current.mutateAsync("r1")
    })
    expect(mockCancelFormato4).toHaveBeenCalledWith("r1")
  })
})

describe("useLastFormato4", () => {
  it("resolves to the countries map", async () => {
    const countries = { chile: { country: "chile", completed_at: "2026-06-01T00:00:00Z", run_id: "r1", period: 202602 } }
    mockGetLastFormato4.mockResolvedValue({ countries })
    const { result } = renderHook(() => useLastFormato4(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(countries)
  })
})

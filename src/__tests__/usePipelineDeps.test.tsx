import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"

// Mock API functions
const mockGetLastPrices = vi.fn()
const mockGetLastElegibilidad = vi.fn()
const mockGetLastWeighting = vi.fn()
const mockGetLastCalibration = vi.fn()
const mockGetLastMtr = vi.fn()

vi.mock("@/lib/api", () => ({
  getLastPrices: (...args: unknown[]) => mockGetLastPrices(...args),
  getLastElegibilidad: (...args: unknown[]) => mockGetLastElegibilidad(...args),
  getLastWeighting: (...args: unknown[]) => mockGetLastWeighting(...args),
  getLastCalibration: (...args: unknown[]) => mockGetLastCalibration(...args),
  getLastMtr: (...args: unknown[]) => mockGetLastMtr(...args),
  // Other exports needed by pipeline-deps.ts imports
  api: { interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } },
  setTokenProvider: vi.fn(),
}))

import { usePipelineDeps } from "@/hooks/usePipelineDeps"

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

const MOCK_PRICES_RESPONSE = {
  countries: {
    chile: { country: "chile", completed_at: "2026-04-01T10:00:00Z", run_id: "r1", period: 202602 },
    colombia: { country: "colombia", completed_at: "2026-04-01T08:00:00Z", run_id: "r2", period: 202602 },
  },
}

const MOCK_ELEGIBILIDAD_RESPONSE = {
  countries: {
    chile: { country: "chile", completed_at: "2026-04-01T12:00:00Z", run_id: "r3", period: 202602 },
  },
}

const MOCK_WEIGHTING_RESPONSE = {
  countries: {
    chile: { country: "chile", completed_at: "2026-04-01T14:00:00Z", run_id: "r4", period: 202602 },
  },
}

describe("usePipelineDeps", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetLastPrices.mockResolvedValue(MOCK_PRICES_RESPONSE)
    mockGetLastElegibilidad.mockResolvedValue(MOCK_ELEGIBILIDAD_RESPONSE)
    mockGetLastWeighting.mockResolvedValue(MOCK_WEIGHTING_RESPONSE)
    mockGetLastCalibration.mockResolvedValue({ countries: {} })
    mockGetLastMtr.mockResolvedValue({ countries: {} })
  })

  it("returns empty dependencies for prices stage (no upstream)", async () => {
    const { result } = renderHook(() => usePipelineDeps("prices", "chile"), {
      wrapper: createWrapper(),
    })

    // Prices has no upstream dependencies, so it should be immediately resolved
    expect(result.current.dependencies).toHaveLength(0)
    expect(result.current.allMet).toBe(true)
  })

  it("returns allMet: true when upstream stage has completed entry for the country", async () => {
    const { result } = renderHook(() => usePipelineDeps("elegibilidad", "chile"), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.dependencies).toHaveLength(1)
    expect(result.current.dependencies[0].stage).toBe("prices")
    expect(result.current.dependencies[0].status).toBe("completed")
    expect(result.current.dependencies[0].completed_at).toBe("2026-04-01T10:00:00Z")
    expect(result.current.allMet).toBe(true)
  })

  it("returns allMet: false when a dependency country entry is missing (not_run)", async () => {
    const { result } = renderHook(() => usePipelineDeps("elegibilidad", "ecuador"), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.dependencies).toHaveLength(1)
    expect(result.current.dependencies[0].stage).toBe("prices")
    expect(result.current.dependencies[0].status).toBe("not_run")
    expect(result.current.allMet).toBe(false)
  })

  it("returns unknown status when API call fails", async () => {
    mockGetLastPrices.mockRejectedValue(new Error("Network error"))

    const { result } = renderHook(() => usePipelineDeps("elegibilidad", "chile"), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.dependencies).toHaveLength(1)
    expect(result.current.dependencies[0].status).toBe("unknown")
    expect(result.current.allMet).toBe(false)
  })

  it("fetches the correct upstream for calibration (weighting)", async () => {
    const { result } = renderHook(() => usePipelineDeps("calibration", "chile"), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.dependencies).toHaveLength(1)
    expect(result.current.dependencies[0].stage).toBe("weighting")
    expect(result.current.dependencies[0].label).toBe("Pesaje")
    expect(result.current.dependencies[0].status).toBe("completed")
    expect(mockGetLastWeighting).toHaveBeenCalled()
  })
})

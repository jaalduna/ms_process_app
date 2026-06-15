import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

// Mock MSAL
vi.mock("@azure/msal-react", () => ({
  useIsAuthenticated: vi.fn(() => true),
  useMsal: vi.fn(() => ({
    instance: {},
    accounts: [{ username: "test@test.com", name: "Test User" }],
    inProgress: "none",
  })),
  MsalProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock sonner toast
const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
const mockToastInfo = vi.fn()
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
    info: (...args: unknown[]) => mockToastInfo(...args),
  }),
}))

// Mock API
const mockGetWeightingRuns = vi.fn()
const mockCreateWeightingRun = vi.fn()
const mockExecuteWeighting = vi.fn()
const mockCancelWeighting = vi.fn()
const mockGetWeightingRun = vi.fn()

vi.mock("@/lib/api", () => ({
  getWeightingRuns: (...args: unknown[]) => mockGetWeightingRuns(...args),
  getWeightingRun: (...args: unknown[]) => mockGetWeightingRun(...args),
  createWeightingRun: (...args: unknown[]) => mockCreateWeightingRun(...args),
  executeWeighting: (...args: unknown[]) => mockExecuteWeighting(...args),
  cancelWeighting: (...args: unknown[]) => mockCancelWeighting(...args),
  getLastWeighting: vi.fn().mockResolvedValue({ countries: {} }),
  downloadWeightingCSV: vi.fn(),
  setTokenProvider: vi.fn(),
  api: { interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } },
}))

import { WeightingCountryCard } from "@/modules/pesaje/components/WeightingCountryCard"
import { DEFAULT_WEIGHTING_PARAMS } from "@/modules/pesaje/weightingParams"

const DEFAULT_PARAMS = DEFAULT_WEIGHTING_PARAMS

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function renderCard(overrides?: {
  countryCode?: string
  period?: string
  lastFinalizedDate?: string | null
}) {
  const queryClient = createTestQueryClient()

  const props = {
    countryCode: overrides?.countryCode ?? "chile",
    period: overrides?.period ?? "202602",
    weightingParams: DEFAULT_PARAMS,
    lastFinalizedDate: overrides?.lastFinalizedDate ?? null,
  }

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <WeightingCountryCard {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("WeightingCountryCard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetWeightingRuns.mockResolvedValue([])
  })

  it("renders country name and flag", async () => {
    renderCard()

    await waitFor(() => {
      expect(screen.getByText("Chile")).toBeInTheDocument()
    })
  })

  it('shows "never" when no last weighting date', async () => {
    renderCard({ lastFinalizedDate: null })

    await waitFor(() => {
      expect(screen.getByText("never")).toBeInTheDocument()
    })
  })

  it("shows relative time when last weighting date is provided", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    renderCard({ lastFinalizedDate: twoHoursAgo })

    await waitFor(() => {
      expect(screen.getByText("2h ago")).toBeInTheDocument()
    })
  })

  it('shows "Ejecutar" button when no active run', async () => {
    mockGetWeightingRuns.mockResolvedValue([])

    renderCard()

    await waitFor(() => {
      expect(screen.getByText("Ejecutar")).toBeInTheDocument()
    })
  })

  it("clicking Ejecutar opens confirmation dialog", async () => {
    const user = userEvent.setup()
    mockGetWeightingRuns.mockResolvedValue([])

    renderCard()

    await waitFor(() => {
      expect(screen.getByText("Ejecutar")).toBeInTheDocument()
    })

    await user.click(screen.getByText("Ejecutar"))

    await waitFor(() => {
      expect(screen.getByText("Confirmar ejecucion")).toBeInTheDocument()
    })
  })

  it("confirming execution calls createWeightingRun then executeWeighting", async () => {
    const user = userEvent.setup()
    mockGetWeightingRuns.mockResolvedValue([])
    const mockRun = { run_id: "test-run-1", country: "chile", status: "pending" }
    mockCreateWeightingRun.mockResolvedValue(mockRun)
    mockExecuteWeighting.mockResolvedValue({ ...mockRun, status: "running" })

    renderCard()

    await waitFor(() => {
      expect(screen.getByText("Ejecutar")).toBeInTheDocument()
    })

    await user.click(screen.getByText("Ejecutar"))

    await waitFor(() => {
      expect(screen.getByText("Confirmar")).toBeInTheDocument()
    })

    await user.click(screen.getByText("Confirmar"))

    await waitFor(() => {
      expect(mockCreateWeightingRun).toHaveBeenCalledWith({
        country: "chile",
        period: 202602,
        parameters: DEFAULT_PARAMS,
      })
    })

    await waitFor(() => {
      expect(mockExecuteWeighting).toHaveBeenCalledWith("test-run-1")
    })
  })

  it("shows status badge for a running run", async () => {
    mockGetWeightingRuns.mockResolvedValue([
      {
        run_id: "run-1",
        country: "chile",
        period: 202602,
        status: "running",
        steps: [
          { name: "load_eligible", status: "completed", started_at: "2026-01-01T00:00:00Z", completed_at: "2026-01-01T00:01:00Z" },
          { name: "calculate_weights", status: "running", started_at: "2026-01-01T00:01:00Z" },
        ],
        current_step: "calculate_weights",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:01:00Z",
      },
    ])

    renderCard()

    await waitFor(() => {
      expect(screen.getByText("Ejecutando...")).toBeInTheDocument()
    })
  })

  it("shows Detener button when run is processing", async () => {
    mockGetWeightingRuns.mockResolvedValue([
      {
        run_id: "run-1",
        country: "chile",
        period: 202602,
        status: "running",
        steps: [],
        current_step: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ])

    renderCard()

    await waitFor(() => {
      expect(screen.getByText("Detener")).toBeInTheDocument()
    })
  })

  it("action row wraps so Detener does not clip off the card while processing", async () => {
    mockGetWeightingRuns.mockResolvedValue([
      {
        run_id: "run-1",
        country: "chile",
        period: 202602,
        status: "running",
        steps: [],
        current_step: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ])

    renderCard()

    const detener = await screen.findByText("Detener")
    // The action row is the flex container holding both the Procesando button
    // and the Detener button. It must wrap instead of clipping overflow.
    const actionRow = detener.closest("div.flex")
    expect(actionRow).not.toBeNull()
    expect(actionRow).toHaveClass("flex-wrap")
  })

  it("shows error message when run has failed", async () => {
    mockGetWeightingRuns.mockResolvedValue([
      {
        run_id: "run-1",
        country: "chile",
        period: 202602,
        status: "failed",
        steps: [],
        current_step: null,
        error_message: "Pipeline failed at step: calculate_weights",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ])

    renderCard()

    await waitFor(() => {
      expect(screen.getByText("Error")).toBeInTheDocument()
      expect(screen.getByText("Pipeline failed at step: calculate_weights")).toBeInTheDocument()
    })
  })

  it("shows Re-ejecutar button when run has failed", async () => {
    mockGetWeightingRuns.mockResolvedValue([
      {
        run_id: "run-1",
        country: "chile",
        period: 202602,
        status: "failed",
        steps: [],
        current_step: null,
        error_message: "fail",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ])

    renderCard()

    await waitFor(() => {
      expect(screen.getByText("Re-ejecutar")).toBeInTheDocument()
    })
  })
})

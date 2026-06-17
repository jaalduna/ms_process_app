import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}))

// Mock API
const mockGetCountries = vi.fn()
const mockGetProcessStatus = vi.fn()

vi.mock("@/lib/api", () => ({
  getCountries: (...args: unknown[]) => mockGetCountries(...args),
  getLastCalibration: vi.fn().mockResolvedValue({ countries: {} }),
  getLastElegibilidad: vi.fn().mockResolvedValue({ countries: {} }),
  getLastPrices: vi.fn().mockResolvedValue({ countries: {} }),
  getLastWeighting: vi.fn().mockResolvedValue({ countries: {} }),
  getLastMtr: vi.fn().mockResolvedValue({ countries: {} }),
  getProcessStatus: (...args: unknown[]) => mockGetProcessStatus(...args),
  openProcess: vi.fn(),
  closeProcess: vi.fn(),
  setTokenProvider: vi.fn(),
  api: { interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } },
}))

const MOCK_COUNTRIES = {
  countries: [
    { code: "argentina", queries: [], queries_count: 0, type: "country" },
    { code: "chile", queries: [], queries_count: 0, type: "country" },
  ],
}

const MOCK_PROCESS_STATUS = {
  countries: {
    argentina: {
      precios: {
        country: "argentina",
        stage: "precios",
        status: "open",
        changed_by: "Maria Gonzalez",
        changed_by_email: "maria.gonzalez@kantar.com",
        changed_at: "2026-06-10T14:30:00.000Z",
        history: [],
      },
      pesaje: {
        country: "argentina",
        stage: "pesaje",
        status: "closed",
        changed_by: "Carlos Pereira",
        changed_by_email: "carlos.pereira@kantar.com",
        changed_at: "2026-06-09T10:00:00.000Z",
        history: [],
      },
    },
    chile: {
      precios: {
        country: "chile",
        stage: "precios",
        status: "closed",
        changed_by: null,
        changed_by_email: null,
        changed_at: null,
        history: [],
      },
    },
  },
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

async function renderOverview() {
  const { default: OverviewPage } = await import("@/modules/overview/pages/OverviewPage")
  renderWithProviders(<OverviewPage />)
}

describe("OverviewPage process status reflection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCountries.mockResolvedValue(MOCK_COUNTRIES)
    mockGetProcessStatus.mockResolvedValue(MOCK_PROCESS_STATUS)
  })

  it("shows an open indicator with attribution for an open stage process", async () => {
    await renderOverview()

    await waitFor(() => {
      expect(
        screen.getByLabelText(/Proceso abierto por Maria Gonzalez/),
      ).toBeInTheDocument()
    })
  })

  it("shows a closed indicator with attribution when a stage was closed", async () => {
    await renderOverview()

    await waitFor(() => {
      expect(
        screen.getByLabelText(/Proceso cerrado por Carlos Pereira/),
      ).toBeInTheDocument()
    })
  })

  it("shows a closed indicator without attribution when no one changed the state", async () => {
    await renderOverview()

    await waitFor(() => {
      expect(screen.getByLabelText("Proceso cerrado")).toBeInTheDocument()
    })
  })

  it("renders no indicator for stages without process state", async () => {
    mockGetProcessStatus.mockResolvedValue({ countries: {} })
    await renderOverview()

    await waitFor(() => {
      expect(screen.getByText("argentina")).toBeInTheDocument()
    })
    expect(screen.queryByLabelText(/Proceso/)).not.toBeInTheDocument()
  })
})

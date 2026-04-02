import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
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
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}))

// Mock API
const mockGetCountries = vi.fn()
const mockGetLastWeighting = vi.fn()
const mockGetWeightingRuns = vi.fn()

vi.mock("@/lib/api", () => ({
  getCountries: (...args: unknown[]) => mockGetCountries(...args),
  getLastWeighting: (...args: unknown[]) => mockGetLastWeighting(...args),
  getWeightingRuns: (...args: unknown[]) => mockGetWeightingRuns(...args),
  getWeightingRun: vi.fn(),
  createWeightingRun: vi.fn(),
  executeWeighting: vi.fn(),
  cancelWeighting: vi.fn(),
  downloadWeightingCSV: vi.fn(),
  setTokenProvider: vi.fn(),
  api: { interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } },
}))

const MOCK_COUNTRIES = {
  countries: [
    { code: "argentina", queries: [], queries_count: 0, type: "country" },
    { code: "bolivia", queries: [], queries_count: 0, type: "country" },
    { code: "brasil", queries: [], queries_count: 0, type: "country" },
    { code: "cam", queries: [], queries_count: 0, type: "country" },
    { code: "chile", queries: [], queries_count: 0, type: "country" },
    { code: "colombia", queries: [], queries_count: 0, type: "country" },
    { code: "ecuador", queries: [], queries_count: 0, type: "country" },
    { code: "mexico", queries: [], queries_count: 0, type: "country" },
    { code: "peru", queries: [], queries_count: 0, type: "country" },
  ],
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

describe("PesajePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetLastWeighting.mockResolvedValue({ countries: {} })
    mockGetWeightingRuns.mockResolvedValue([])
  })

  it("renders country card grid for all 9 countries", async () => {
    mockGetCountries.mockResolvedValue(MOCK_COUNTRIES)

    const { PesajePage } = await import("@/modules/pesaje/pages/PesajePage")
    renderWithProviders(<PesajePage />)

    await waitFor(() => {
      expect(screen.getByText("Argentina")).toBeInTheDocument()
    })

    expect(screen.getByText("Bolivia")).toBeInTheDocument()
    expect(screen.getByText("Brasil")).toBeInTheDocument()
    expect(screen.getByText("CAM")).toBeInTheDocument()
    expect(screen.getByText("Chile")).toBeInTheDocument()
    expect(screen.getByText("Colombia")).toBeInTheDocument()
    expect(screen.getByText("Ecuador")).toBeInTheDocument()
    expect(screen.getByText("Mexico")).toBeInTheDocument()
    expect(screen.getByText("Peru")).toBeInTheDocument()
  })

  it("shows loading skeletons while countries are loading", async () => {
    mockGetCountries.mockReturnValue(new Promise(() => {})) // never resolves

    const { PesajePage } = await import("@/modules/pesaje/pages/PesajePage")
    const { container } = renderWithProviders(<PesajePage />)

    await waitFor(() => {
      const skeletons = container.querySelectorAll(".animate-pulse")
      expect(skeletons.length).toBeGreaterThan(0)
    })
  })

  it("shows error message when country fetch fails", async () => {
    mockGetCountries.mockRejectedValue(new Error("Network error"))

    const { PesajePage } = await import("@/modules/pesaje/pages/PesajePage")
    renderWithProviders(<PesajePage />)

    await waitFor(() => {
      expect(screen.getByText(/Error al cargar paises/)).toBeInTheDocument()
    })
  })

  it("renders page header with title and description", async () => {
    mockGetCountries.mockResolvedValue(MOCK_COUNTRIES)

    const { PesajePage } = await import("@/modules/pesaje/pages/PesajePage")
    renderWithProviders(<PesajePage />)

    expect(screen.getByText("Pesaje")).toBeInTheDocument()
    expect(screen.getByText(/Ejecuta y monitorea procesos de pesaje/)).toBeInTheDocument()
  })

  it('shows "never" for countries with no last weighting date', async () => {
    mockGetCountries.mockResolvedValue({
      countries: [{ code: "chile", queries: [], queries_count: 0, type: "country" }],
    })
    mockGetLastWeighting.mockResolvedValue({ countries: {} })

    const { PesajePage } = await import("@/modules/pesaje/pages/PesajePage")
    renderWithProviders(<PesajePage />)

    await waitFor(() => {
      expect(screen.getByText("never")).toBeInTheDocument()
    })
  })
})

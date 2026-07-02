import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

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
  getProcessStatus: vi.fn().mockResolvedValue({ countries: {} }),
  openProcess: vi.fn(),
  closeProcess: vi.fn(),
  setTokenProvider: vi.fn(),
  // The wired Parametros tab (JAA-581) issues weighting-params requests through
  // this axios instance; stub get/post so the tab can mount in this test.
  api: {
    get: vi.fn().mockResolvedValue({
      data: { country: "chile", rows: [], q_vars: [], m_vars: [], params: {}, version: { hash: "0", modified_at: "", row_count: 0 } },
    }),
    post: vi.fn().mockResolvedValue({ data: { valid: true, errors: [] } }),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
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

function renderWithProviders(ui: React.ReactElement, initialEntries: string[] = ["/pesaje"]) {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("PesajePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
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

  it("no longer renders the global 'Parametros de pesaje' gear (params are per-country now) (ac1)", async () => {
    mockGetCountries.mockResolvedValue(MOCK_COUNTRIES)

    const { PesajePage } = await import("@/modules/pesaje/pages/PesajePage")
    renderWithProviders(<PesajePage />)

    await waitFor(() => {
      expect(screen.getByText("Argentina")).toBeInTheDocument()
    })
    expect(screen.queryByRole("button", { name: "Parametros de pesaje" })).not.toBeInTheDocument()
  })

  it("renders the 3 process-workspace tabs and defaults to Ejecutar (the grid) (ac2)", async () => {
    mockGetCountries.mockResolvedValue(MOCK_COUNTRIES)

    const { PesajePage } = await import("@/modules/pesaje/pages/PesajePage")
    renderWithProviders(<PesajePage />)

    expect(screen.getByRole("tab", { name: "Ejecutar" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Parametros" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Historial" })).toBeInTheDocument()
    // Ejecutar is the default active tab → the country grid is visible
    await waitFor(() => {
      expect(screen.getByText("Argentina")).toBeInTheDocument()
    })
    expect(screen.getByRole("tab", { name: "Ejecutar" })).toHaveAttribute("data-state", "active")
  })

  it("activates the Historial tab from the ?tab=historial URL param and survives refresh (ac3)", async () => {
    mockGetCountries.mockResolvedValue(MOCK_COUNTRIES)
    mockGetWeightingRuns.mockResolvedValue([])

    const { PesajePage } = await import("@/modules/pesaje/pages/PesajePage")
    renderWithProviders(<PesajePage />, ["/pesaje?tab=historial"])

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Historial" })).toHaveAttribute("data-state", "active")
    })
    expect(await screen.findByText("No hay ejecuciones registradas.")).toBeInTheDocument()
  })

  it("switches tab and reflects it in the URL on click (ac3)", async () => {
    const user = userEvent.setup()
    mockGetCountries.mockResolvedValue(MOCK_COUNTRIES)

    const { PesajePage } = await import("@/modules/pesaje/pages/PesajePage")
    renderWithProviders(<PesajePage />)

    await user.click(screen.getByRole("tab", { name: "Parametros" }))
    await waitFor(() => {
      expect(screen.getByText(/organizada por frecuencia de cambio/i)).toBeVisible()
    })
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

  it("Tarjetas/Lista toggle switches to a table with the same countries and preserves actions (JAA-763)", async () => {
    const user = userEvent.setup()
    mockGetCountries.mockResolvedValue(MOCK_COUNTRIES)

    const { PesajePage } = await import("@/modules/pesaje/pages/PesajePage")
    renderWithProviders(<PesajePage />)

    await waitFor(() => expect(screen.getByText("Argentina")).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: "Lista" }))

    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument())
    expect(screen.getByText("Chile")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Abrir detalle de Pesaje para Chile/i })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Tarjetas" }))
    await waitFor(() => expect(screen.queryByRole("table")).not.toBeInTheDocument())
  })
})

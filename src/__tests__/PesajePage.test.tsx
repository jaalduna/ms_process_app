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
const mockGetProcessStatus = vi.fn()

vi.mock("@/lib/api", () => ({
  getCountries: (...args: unknown[]) => mockGetCountries(...args),
  getLastWeighting: (...args: unknown[]) => mockGetLastWeighting(...args),
  getWeightingRuns: (...args: unknown[]) => mockGetWeightingRuns(...args),
  getWeightingRun: vi.fn(),
  createWeightingRun: vi.fn(),
  executeWeighting: vi.fn(),
  cancelWeighting: vi.fn(),
  downloadWeightingCSV: vi.fn(),
  getProcessStatus: (...args: unknown[]) => mockGetProcessStatus(...args),
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
    mockGetProcessStatus.mockResolvedValue({ countries: {} })
  })

  it("renders page header with title and description", async () => {
    mockGetCountries.mockResolvedValue(MOCK_COUNTRIES)

    const { PesajePage } = await import("@/modules/pesaje/pages/PesajePage")
    renderWithProviders(<PesajePage />)

    expect(screen.getByText("Pesaje")).toBeInTheDocument()
    expect(screen.getByText(/Ejecuta y monitorea procesos de pesaje/)).toBeInTheDocument()
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

  it("no longer renders the global 'Parametros de pesaje' gear (params are per-country now) (ac1)", async () => {
    mockGetCountries.mockResolvedValue(MOCK_COUNTRIES)

    const { PesajePage } = await import("@/modules/pesaje/pages/PesajePage")
    renderWithProviders(<PesajePage />)

    await waitFor(() => {
      expect(screen.getByText("Ejecutar Pesaje")).toBeInTheDocument()
    })
    expect(screen.queryByRole("button", { name: "Parametros de pesaje" })).not.toBeInTheDocument()
  })

  it("renders the 2 process-workspace tabs (Historial merged into Ejecutar — JAA feedback: no more cards)", async () => {
    mockGetCountries.mockResolvedValue(MOCK_COUNTRIES)

    const { PesajePage } = await import("@/modules/pesaje/pages/PesajePage")
    renderWithProviders(<PesajePage />)

    expect(screen.getByRole("tab", { name: "Ejecutar" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Parametros" })).toBeInTheDocument()
    expect(screen.queryByRole("tab", { name: "Historial" })).not.toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Ejecutar" })).toHaveAttribute("data-state", "active")
  })

  it("shows the launch panel, an empty board message, and the history table on the Ejecutar tab by default", async () => {
    mockGetCountries.mockResolvedValue(MOCK_COUNTRIES)

    const { PesajePage } = await import("@/modules/pesaje/pages/PesajePage")
    renderWithProviders(<PesajePage />)

    await waitFor(() => expect(screen.getByText("Ejecutar Pesaje")).toBeInTheDocument())
    expect(screen.getByText(/Sin corridas activas para este periodo/)).toBeInTheDocument()
    expect(screen.getByText("Historial")).toBeInTheDocument()
    expect(await screen.findByText("No hay ejecuciones registradas.")).toBeInTheDocument()
  })

  it("an unknown ?tab=historial falls back to the default Ejecutar tab (the old dedicated tab was merged there)", async () => {
    mockGetCountries.mockResolvedValue(MOCK_COUNTRIES)

    const { PesajePage } = await import("@/modules/pesaje/pages/PesajePage")
    renderWithProviders(<PesajePage />, ["/pesaje?tab=historial"])

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Ejecutar" })).toHaveAttribute("data-state", "active")
    })
    expect(await screen.findByText("No hay ejecuciones registradas.")).toBeInTheDocument()
  })

  it("switches tab and reflects it in the URL on click", async () => {
    const user = userEvent.setup()
    mockGetCountries.mockResolvedValue(MOCK_COUNTRIES)

    const { PesajePage } = await import("@/modules/pesaje/pages/PesajePage")
    renderWithProviders(<PesajePage />)

    await user.click(screen.getByRole("tab", { name: "Parametros" }))
    await waitFor(() => {
      expect(screen.getByText(/organizada por frecuencia de cambio/i)).toBeVisible()
    })
  })

  it('shows "sin ejecuciones" for a country with no last weighting date once selected', async () => {
    const user = userEvent.setup()
    mockGetCountries.mockResolvedValue({
      countries: [{ code: "chile", queries: [], queries_count: 0, type: "country" }],
    })
    mockGetLastWeighting.mockResolvedValue({ countries: {} })

    const { PesajePage } = await import("@/modules/pesaje/pages/PesajePage")
    renderWithProviders(<PesajePage />)

    await user.click(await screen.findByRole("combobox", { name: "Pais a ejecutar" }))
    await user.click(await screen.findByRole("option", { name: /Chile/ }))

    expect(await screen.findByText(/sin ejecuciones/)).toBeInTheDocument()
  })

  it("selecting a country and clicking the launch button opens the Configurar Pesaje dialog", async () => {
    const user = userEvent.setup()
    mockGetCountries.mockResolvedValue({
      countries: [{ code: "chile", queries: [], queries_count: 0, type: "country" }],
    })

    const { PesajePage } = await import("@/modules/pesaje/pages/PesajePage")
    renderWithProviders(<PesajePage />)

    await user.click(await screen.findByRole("combobox", { name: "Pais a ejecutar" }))
    await user.click(await screen.findByRole("option", { name: /Chile/ }))
    await user.click(screen.getByRole("button", { name: /Configurar y ejecutar/ }))

    expect(await screen.findByText("Configurar Pesaje")).toBeInTheDocument()
  })

  it("renders a run card only for pending/running/failed runs, not completed ones", async () => {
    mockGetCountries.mockResolvedValue(MOCK_COUNTRIES)
    mockGetWeightingRuns.mockResolvedValue([
      {
        run_id: "run-pending",
        country: "chile",
        period: 202607,
        status: "pending",
        created_at: "2026-07-01T00:00:00Z",
        updated_at: "2026-07-01T00:00:00Z",
      },
      {
        run_id: "run-done",
        country: "peru",
        period: 202607,
        status: "completed",
        created_at: "2026-07-01T00:00:00Z",
        updated_at: "2026-07-01T00:00:00Z",
        started_at: "2026-07-01T00:00:00Z",
        completed_at: "2026-07-01T00:05:00Z",
      },
    ])

    const { PesajePage } = await import("@/modules/pesaje/pages/PesajePage")
    renderWithProviders(<PesajePage />)

    expect(await screen.findByText("Chile")).toBeInTheDocument()
    expect(screen.queryByText(/Sin corridas activas/)).not.toBeInTheDocument()
    // Peru's run is completed — no card for it up top (only in the history table).
    expect(screen.queryByRole("heading", { name: "Peru" })).not.toBeInTheDocument()
  })
})

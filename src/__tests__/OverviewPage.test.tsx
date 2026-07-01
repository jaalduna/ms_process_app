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
const h = vi.hoisted(() => ({
  getCountries: vi.fn(),
  getProcessStatus: vi.fn(),
  getLastCalibration: vi.fn(),
  getLastElegibilidad: vi.fn(),
  getLastPrices: vi.fn(),
  getLastWeighting: vi.fn(),
  getLastMtr: vi.fn(),
}))
const mockGetCountries = h.getCountries
const mockGetProcessStatus = h.getProcessStatus

vi.mock("@/lib/api", () => ({
  getCountries: h.getCountries,
  getLastCalibration: h.getLastCalibration,
  getLastElegibilidad: h.getLastElegibilidad,
  getLastPrices: h.getLastPrices,
  getLastWeighting: h.getLastWeighting,
  getLastMtr: h.getLastMtr,
  getProcessStatus: h.getProcessStatus,
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

// A populated last-* response so the table renders (otherwise it stays in the
// loading skeleton state and process indicators never mount).
const SOME_LAST = {
  countries: {
    argentina: { country: "argentina", completed_at: "2026-02-15T00:00:00.000Z", run_id: "x", period: 202602 },
  },
}

describe("OverviewPage process status reflection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCountries.mockResolvedValue(MOCK_COUNTRIES)
    mockGetProcessStatus.mockResolvedValue(MOCK_PROCESS_STATUS)
    h.getLastCalibration.mockResolvedValue(SOME_LAST)
    h.getLastElegibilidad.mockResolvedValue(SOME_LAST)
    h.getLastPrices.mockResolvedValue(SOME_LAST)
    h.getLastWeighting.mockResolvedValue(SOME_LAST)
    h.getLastMtr.mockResolvedValue(SOME_LAST)
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

// JAA-421 — period filter on the Overview.
describe("OverviewPage period filter", () => {
  // prices has its latest run in 202602; eligibility in 202605. Unfiltered calls
  // (no period arg) drive discovery; period-filtered calls drive the table.
  const PRICES_FEB = {
    countries: { argentina: { country: "argentina", completed_at: "2026-02-15T00:00:00.000Z", run_id: "p1", period: 202602 } },
  }
  const ELEG_MAY = {
    countries: { argentina: { country: "argentina", completed_at: "2026-05-20T00:00:00.000Z", run_id: "e1", period: 202605 } },
  }
  const EMPTY = { countries: {} }

  function periodAware(latest: typeof PRICES_FEB, latestPeriod: number) {
    return (period?: number) => {
      if (period === undefined) return Promise.resolve(latest) // discovery
      if (period === latestPeriod) return Promise.resolve(latest)
      return Promise.resolve(EMPTY)
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCountries.mockResolvedValue(MOCK_COUNTRIES)
    mockGetProcessStatus.mockResolvedValue({ countries: {} })
    h.getLastPrices.mockImplementation(periodAware(PRICES_FEB, 202602))
    h.getLastElegibilidad.mockImplementation(periodAware(ELEG_MAY, 202605))
    h.getLastWeighting.mockImplementation(() => Promise.resolve(EMPTY))
    h.getLastMtr.mockImplementation(() => Promise.resolve(EMPTY))
    h.getLastCalibration.mockImplementation(() => Promise.resolve(EMPTY))
  })

  it("renders a period selector", async () => {
    await renderOverview()
    await waitFor(() => expect(screen.getByRole("combobox")).toBeInTheDocument())
  })

  it("defaults to the most recent period that has data (202605)", async () => {
    await renderOverview()
    // 202605 is newer than 202602 → default subtitle reflects May 2026.
    await waitFor(() => expect(screen.getByText(/periodo may 2026/i)).toBeInTheDocument())
    // Eligibility queried with the default period.
    expect(h.getLastElegibilidad).toHaveBeenCalledWith(202605)
  })

  it("queries every stage with the same selected period (no mixed periods)", async () => {
    await renderOverview()
    await waitFor(() => expect(screen.getByText(/periodo may 2026/i)).toBeInTheDocument())
    for (const fn of [h.getLastPrices, h.getLastWeighting, h.getLastMtr, h.getLastCalibration, h.getLastElegibilidad]) {
      expect(fn).toHaveBeenCalledWith(202605)
    }
  })

  it("shows '—' for a stage with no run in the selected period", async () => {
    await renderOverview()
    // At 202605, prices has no run → its cell shows the dash. Wait for the
    // table cells to resolve (subtitle renders before the display queries do).
    await waitFor(() => expect(screen.getAllByText("—").length).toBeGreaterThan(0))
  })

  it("does not render the per-cell period number", async () => {
    await renderOverview()
    // Wait for the table to finish loading (cells rendered), then assert the
    // raw period digits never appear inside any cell.
    await waitFor(() => expect(screen.getAllByText("—").length).toBeGreaterThan(0))
    expect(screen.queryByText("202605")).not.toBeInTheDocument()
    expect(screen.queryByText("202602")).not.toBeInTheDocument()
  })
})

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import type { EventSummary } from "@/types/api"

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const mockRoles = { current: ["admin"] }
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ roles: mockRoles.current }),
}))

const mockGetCountries = vi.fn()
const mockGetCalibrationRuns = vi.fn()
const mockDownloadCalibrationReport = vi.fn().mockResolvedValue(undefined)

vi.mock("@/lib/api", () => ({
  getCountries: (...args: unknown[]) => mockGetCountries(...args),
  getCalibrationRuns: (...args: unknown[]) => mockGetCalibrationRuns(...args),
  triggerCalibration: vi.fn(),
  cancelJob: vi.fn(),
  downloadCalibrationReport: (...args: unknown[]) => mockDownloadCalibrationReport(...args),
}))

const MOCK_COUNTRIES = {
  countries: [
    { code: "chile", queries: [], queries_count: 0, type: "country" },
    { code: "mexico", queries: [], queries_count: 0, type: "country" },
  ],
}

function makeRun(overrides: Partial<EventSummary> = {}): EventSummary {
  return {
    job_id: "job-1",
    status: "completed",
    country: "chile",
    stage: "calibracion",
    tag: "chile-calibracion-1",
    period: "202606",
    queries_total: 2,
    queries_completed: 2,
    queries_failed: 0,
    created_at: "2026-07-01T10:00:00Z",
    started_at: "2026-07-01T10:00:05Z",
    completed_at: "2026-07-01T10:05:00Z",
    triggered_by: "ana",
    error: null,
    current_query: null,
    failed_queries: [],
    running_queries: [],
    queries_running: 0,
    total_rows_extracted: 0,
    ...overrides,
  }
}

// Two runs per country so the history table (all runs) differs from the
// per-country cards above it (latest run only).
const RUNS: EventSummary[] = [
  makeRun({
    job_id: "chile-1",
    country: "chile",
    triggered_by: "ana",
    status: "completed",
    created_at: "2026-07-01T10:00:00Z",
    completed_at: "2026-07-01T10:05:00Z",
  }),
  makeRun({
    job_id: "chile-2",
    country: "chile",
    triggered_by: "beto",
    status: "failed",
    created_at: "2026-07-02T10:00:00Z",
    completed_at: "2026-07-02T10:01:00Z",
  }),
  makeRun({
    job_id: "mexico-1",
    country: "mexico",
    triggered_by: "carla",
    status: "completed",
    created_at: "2026-07-03T10:00:00Z",
    completed_at: "2026-07-03T10:10:00Z",
  }),
]

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }
}

async function renderPage() {
  const { CalibrationRunPage } = await import("../CalibrationRunPage")
  const Wrapper = createWrapper()
  render(<CalibrationRunPage />, { wrapper: Wrapper })
  await screen.findByText("Historial del período")
}

function historyRowTexts() {
  const table = screen.getAllByRole("table").at(-1)!
  // Rows are clickable (role="button" for the detail modal — see
  // HistoryRunDetailModal), so they no longer expose role="row" for
  // testing-library; query the tbody directly instead.
  const rows = table.querySelectorAll("tbody tr")
  return Array.from(rows, (r) => r.textContent ?? "")
}

describe("CalibrationRunPage — historial: filtros y orden", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCountries.mockResolvedValue(MOCK_COUNTRIES)
    mockGetCalibrationRuns.mockResolvedValue({ items: RUNS })
  })

  it("filters the history table by country", async () => {
    const user = userEvent.setup()
    await renderPage()
    expect(historyRowTexts()).toHaveLength(3)

    await user.click(screen.getByRole("combobox", { name: "Filtrar por país" }))
    await user.click(await screen.findByRole("option", { name: /Mexico/ }))

    const rows = historyRowTexts()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toContain("carla")
  })

  it("filters the history table by status", async () => {
    const user = userEvent.setup()
    await renderPage()

    await user.click(screen.getByRole("combobox", { name: "Filtrar por estado" }))
    await user.click(await screen.findByRole("option", { name: "Error" }))

    const rows = historyRowTexts()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toContain("beto")
  })

  it("filters the history table by who launched it (triggered_by)", async () => {
    const user = userEvent.setup()
    await renderPage()

    await user.click(screen.getByRole("combobox", { name: "Filtrar por quién lanzó" }))
    await user.click(await screen.findByRole("option", { name: "carla" }))

    const rows = historyRowTexts()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toContain("carla")
  })

  it("shows an empty state when no run matches the filters", async () => {
    const user = userEvent.setup()
    await renderPage()

    await user.click(screen.getByRole("combobox", { name: "Filtrar por país" }))
    await user.click(await screen.findByRole("option", { name: /Mexico/ }))
    await user.click(screen.getByRole("combobox", { name: "Filtrar por estado" }))
    await user.click(await screen.findByRole("option", { name: "Error" }))

    expect(screen.getByText("Sin corridas que coincidan con los filtros")).toBeInTheDocument()
  })

  it("sorts the history table by date, toggling asc/desc", async () => {
    const user = userEvent.setup()
    await renderPage()

    // Default order: created_at desc → mexico-1, chile-2, chile-1.
    expect(historyRowTexts().map((t) => (t.includes("carla") ? "mexico" : t.includes("beto") ? "chile-2" : "chile-1"))).toEqual([
      "mexico",
      "chile-2",
      "chile-1",
    ])

    await user.click(screen.getByRole("button", { name: /^Fecha/ }))
    const asc = historyRowTexts()
    expect(asc[0]).toContain("ana") // 2026-07-01, earliest
    expect(asc.at(-1)).toContain("carla") // 2026-07-03, latest

    await user.click(screen.getByRole("button", { name: /^Fecha/ }))
    const desc = historyRowTexts()
    expect(desc[0]).toContain("carla")
    expect(desc.at(-1)).toContain("ana")
  })
})

describe("CalibrationRunPage — tarjetas de ejecución (P0: solo pending/running/failed)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCountries.mockResolvedValue(MOCK_COUNTRIES)
  })

  it("does not render a card for completed or cancelled runs — only for pending/running/failed", async () => {
    mockGetCalibrationRuns.mockResolvedValue({
      items: [
        makeRun({ job_id: "chile-completed", country: "chile", status: "completed" }),
        makeRun({ job_id: "mexico-cancelled", country: "mexico", status: "cancelled", completed_at: "2026-07-01T10:01:00Z" }),
      ],
    })
    await renderPage()

    expect(screen.queryByTestId("execution-run-chile")).not.toBeInTheDocument()
    expect(screen.queryByTestId("execution-run-mexico")).not.toBeInTheDocument()
    // Runs still show up in the history table below.
    expect(historyRowTexts()).toHaveLength(2)
  })

  it("renders a card with Reintentar for failed runs", async () => {
    mockGetCalibrationRuns.mockResolvedValue({
      items: [makeRun({ job_id: "chile-failed", country: "chile", status: "failed", error: "boom" })],
    })
    await renderPage()

    const card = screen.getByTestId("execution-run-chile")
    expect(within(card).getByRole("button", { name: /Reintentar/ })).toBeInTheDocument()
  })

  it("renders a card for pending and running runs", async () => {
    mockGetCalibrationRuns.mockResolvedValue({
      items: [
        makeRun({ job_id: "chile-pending", country: "chile", status: "pending", completed_at: null }),
        makeRun({ job_id: "mexico-running", country: "mexico", status: "running", completed_at: null }),
      ],
    })
    await renderPage()

    expect(screen.getByTestId("execution-run-chile")).toBeInTheDocument()
    expect(screen.getByTestId("execution-run-mexico")).toBeInTheDocument()
  })

  it("shows a discreet empty state when every run is finished (no active/failed cards)", async () => {
    mockGetCalibrationRuns.mockResolvedValue({
      items: [makeRun({ job_id: "chile-completed", country: "chile", status: "completed" })],
    })
    await renderPage()

    expect(screen.getByText("Sin corridas activas — revisa el historial abajo.")).toBeInTheDocument()
  })
})

describe("CalibrationRunPage — modal de detalle del historial", () => {
  const RUN_WITH_URL = makeRun({
    job_id: "chile-1",
    country: "chile",
    tag: "chile-calibracion-1",
    triggered_by: "ana",
    status: "completed",
    run_page_url: "https://adb-123.azuredatabricks.net/#job/1/run/2",
  } as Partial<EventSummary>)

  beforeEach(() => {
    vi.clearAllMocks()
    mockRoles.current = ["admin"]
    mockGetCountries.mockResolvedValue(MOCK_COUNTRIES)
    mockGetCalibrationRuns.mockResolvedValue({ items: [RUN_WITH_URL] })
  })

  it("clicking a history row opens a modal with the run's tag and country", async () => {
    const user = userEvent.setup()
    await renderPage()

    await user.click(screen.getByRole("button", { name: /Ver detalle de la corrida.*chile-calibracion-1/ }))

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("chile-calibracion-1")).toBeInTheDocument()
    expect(within(dialog).getByText("Chile")).toBeInTheDocument()
  })

  it("clicking the row's download button downloads without opening the modal", async () => {
    const user = userEvent.setup()
    await renderPage()

    await user.click(screen.getByRole("button", { name: /Descargar resultados/ }))

    expect(mockDownloadCalibrationReport).toHaveBeenCalledWith(RUN_WITH_URL.tag, RUN_WITH_URL.country)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("shows the Databricks link only for admins", async () => {
    const user = userEvent.setup()
    await renderPage()

    await user.click(screen.getByRole("button", { name: /Ver detalle de la corrida.*chile-calibracion-1/ }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByRole("link", { name: /Ver en Databricks/ })).toBeInTheDocument()
  })

  it("hides the Databricks link for non-admin roles", async () => {
    mockRoles.current = ["calibracion_specialist"]
    const user = userEvent.setup()
    await renderPage()

    await user.click(screen.getByRole("button", { name: /Ver detalle de la corrida.*chile-calibracion-1/ }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).queryByRole("link", { name: /Ver en Databricks/ })).not.toBeInTheDocument()
  })
})

describe("CalibrationRunPage — historial: paginación", () => {
  // 15 runs, default order = created_at desc: 3 "beto" (Jul 13-15, newest)
  // then 12 "ana" (Jul 1-12). Page size defaults to 10, so page 1 is the 3
  // "beto" runs + the 7 newest "ana" runs, page 2 is the remaining 5 "ana".
  const PAGED_RUNS: EventSummary[] = [
    ...Array.from({ length: 12 }, (_, i) =>
      makeRun({
        job_id: `ana-${i}`,
        country: "chile",
        triggered_by: "ana",
        status: "completed",
        created_at: `2026-07-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
        completed_at: `2026-07-${String(i + 1).padStart(2, "0")}T10:05:00Z`,
      }),
    ),
    ...Array.from({ length: 3 }, (_, i) =>
      makeRun({
        job_id: `beto-${i}`,
        country: "chile",
        triggered_by: "beto",
        status: "completed",
        created_at: `2026-07-${String(i + 13).padStart(2, "0")}T10:00:00Z`,
        completed_at: `2026-07-${String(i + 13).padStart(2, "0")}T10:05:00Z`,
      }),
    ),
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCountries.mockResolvedValue(MOCK_COUNTRIES)
  })

  it("shows page 1 by default (10 rows) and the correct rows after Siguiente", async () => {
    mockGetCalibrationRuns.mockResolvedValue({ items: PAGED_RUNS })
    const user = userEvent.setup()
    await renderPage()

    let rows = historyRowTexts()
    expect(rows).toHaveLength(10)
    expect(rows.filter((r) => r.includes("beto"))).toHaveLength(3)
    expect(screen.getByText("1–10 de 15")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Anterior/ })).toBeDisabled()

    await user.click(screen.getByRole("button", { name: /Siguiente/ }))

    rows = historyRowTexts()
    expect(rows).toHaveLength(5)
    expect(rows.some((r) => r.includes("beto"))).toBe(false)
    expect(screen.getByText("11–15 de 15")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Siguiente/ })).toBeDisabled()
  })

  it("resets to page 1 when a filter changes", async () => {
    mockGetCalibrationRuns.mockResolvedValue({ items: PAGED_RUNS })
    const user = userEvent.setup()
    await renderPage()

    await user.click(screen.getByRole("button", { name: /Siguiente/ }))
    expect(screen.getByText("11–15 de 15")).toBeInTheDocument()

    await user.click(screen.getByRole("combobox", { name: "Filtrar por quién lanzó" }))
    await user.click(await screen.findByRole("option", { name: "ana" }))

    // 12 "ana" runs, page size 10 → page 1 is "1–10 de 12", not "11–12 de 12"
    // (which is what an un-reset page 2 would show).
    expect(screen.getByText("1–10 de 12")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Anterior/ })).toBeDisabled()
  })

  it("hides the pagination controls when every row fits on one page", async () => {
    mockGetCalibrationRuns.mockResolvedValue({ items: RUNS })
    await renderPage()

    expect(historyRowTexts()).toHaveLength(3)
    expect(screen.queryByRole("button", { name: /Siguiente/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Anterior/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/de 3/)).not.toBeInTheDocument()
  })
})

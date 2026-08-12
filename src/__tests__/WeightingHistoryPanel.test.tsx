import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { WeightingRun } from "@/modules/pesaje/types"

const mockToastError = vi.fn()
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: (...a: unknown[]) => mockToastError(...a),
  }),
}))

const mockDownloadWeightingCSV = vi.fn()
vi.mock("@/lib/api", () => ({
  downloadWeightingCSV: (...a: unknown[]) => mockDownloadWeightingCSV(...a),
}))

let runsState: { data: WeightingRun[] | undefined; isLoading: boolean }
vi.mock("../modules/pesaje/hooks/useWeighting", () => ({
  useWeightingRuns: () => runsState,
}))

vi.mock("../modules/pesaje/components/WeightingDetailModal", () => ({
  WeightingDetailModal: ({ run, open }: { run: WeightingRun | null; open: boolean }) =>
    open && run ? <div data-testid="weighting-detail">detail:{run.run_id}</div> : null,
}))

import { WeightingHistoryPanel } from "@/modules/pesaje/components/WeightingHistoryPanel"

function makeRun(overrides: Partial<WeightingRun>): WeightingRun {
  return {
    run_id: "run-1",
    country: "chile",
    period: 202602,
    status: "completed",
    created_by: "ana@kantar.com",
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:01:00Z",
    started_at: "2026-02-01T00:00:00Z",
    completed_at: "2026-02-01T00:01:00Z",
    ...overrides,
  }
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={qc}>
      <WeightingHistoryPanel />
    </QueryClientProvider>,
  )
}

describe("WeightingHistoryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDownloadWeightingCSV.mockResolvedValue(undefined)
  })

  it("shows the empty state when there are no runs", () => {
    runsState = { data: [], isLoading: false }
    renderPanel()
    expect(screen.getByText("No hay ejecuciones registradas.")).toBeInTheDocument()
  })

  it("renders every sortable column header", () => {
    runsState = { data: [makeRun({})], isLoading: false }
    renderPanel()
    for (const label of ["Fecha", "Pais", "Periodo", "Lanzado por", "Duracion", "Estado"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument()
    }
  })

  it("filters by pais", async () => {
    runsState = {
      data: [
        makeRun({ run_id: "run-cl", country: "chile" }),
        makeRun({ run_id: "run-ar", country: "argentina" }),
      ],
      isLoading: false,
    }
    const user = userEvent.setup()
    renderPanel()
    const table = screen.getByRole("table")
    expect(within(table).getByText(/Chile/)).toBeInTheDocument()
    expect(within(table).getByText(/Argentina/)).toBeInTheDocument()

    await user.click(screen.getByRole("combobox", { name: "Filtrar por pais" }))
    await user.click(await screen.findByRole("option", { name: /Chile/ }))

    expect(within(table).getByText(/Chile/)).toBeInTheDocument()
    expect(within(table).queryByText(/Argentina/)).not.toBeInTheDocument()
  })

  it("filters by estado", async () => {
    runsState = {
      data: [
        makeRun({ run_id: "run-done", status: "completed" }),
        makeRun({ run_id: "run-pending", status: "pending", started_at: undefined, completed_at: undefined }),
      ],
      isLoading: false,
    }
    const user = userEvent.setup()
    renderPanel()
    const table = screen.getByRole("table")
    expect(within(table).getByText("Completado")).toBeInTheDocument()
    expect(within(table).getByText("Pendiente")).toBeInTheDocument()

    await user.click(screen.getByRole("combobox", { name: "Filtrar por estado" }))
    await user.click(await screen.findByRole("option", { name: "Pendiente" }))

    expect(within(table).getByText("Pendiente")).toBeInTheDocument()
    expect(within(table).queryByText("Completado")).not.toBeInTheDocument()
  })

  it("shows the no-match message when filters exclude every row", async () => {
    runsState = { data: [makeRun({ status: "completed" })], isLoading: false }
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole("combobox", { name: "Filtrar por estado" }))
    await user.click(await screen.findByRole("option", { name: "Cancelado" }))

    expect(screen.getByText("Sin corridas que coincidan con los filtros")).toBeInTheDocument()
  })

  it("toggles sort direction on repeated header clicks", async () => {
    runsState = {
      data: [
        makeRun({ run_id: "run-ar", country: "argentina", created_at: "2026-02-01T00:00:00Z" }),
        makeRun({ run_id: "run-cl", country: "chile", created_at: "2026-02-02T00:00:00Z" }),
      ],
      isLoading: false,
    }
    const user = userEvent.setup()
    renderPanel()

    const rowsCountryOf = () =>
      screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[1].textContent)

    await user.click(screen.getByRole("button", { name: "Pais" }))
    expect(rowsCountryOf()[0]).toContain("Argentina")

    await user.click(screen.getByRole("button", { name: "Pais" }))
    expect(rowsCountryOf()[0]).toContain("Chile")
  })

  it("paginates client-side and advances with Siguiente", async () => {
    runsState = {
      data: Array.from({ length: 12 }, (_, i) =>
        makeRun({ run_id: `run-${i}`, country: "chile", created_at: `2026-02-${String(i + 1).padStart(2, "0")}T00:00:00Z` }),
      ),
      isLoading: false,
    }
    const user = userEvent.setup()
    renderPanel()

    expect(screen.getByText("1–10 de 12")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled()

    await user.click(screen.getByRole("button", { name: "Siguiente" }))
    expect(screen.getByText("11–12 de 12")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled()
  })

  it("shows a download button only for completed runs, and it calls downloadWeightingCSV", async () => {
    runsState = {
      data: [
        makeRun({ run_id: "run-done", status: "completed" }),
        makeRun({ run_id: "run-pending", status: "pending", started_at: undefined, completed_at: undefined }),
      ],
      isLoading: false,
    }
    const user = userEvent.setup()
    renderPanel()

    expect(screen.getAllByRole("button", { name: /Descargar resultados/ })).toHaveLength(1)

    await user.click(screen.getByRole("button", { name: /Descargar resultados/ }))
    await waitFor(() => expect(mockDownloadWeightingCSV).toHaveBeenCalledWith("run-done"))
  })

  it("opens the detail modal for the clicked run via the Ver detalle button", async () => {
    runsState = { data: [makeRun({ run_id: "run-xyz" })], isLoading: false }
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole("button", { name: /Ver detalle/ }))
    expect(await screen.findByTestId("weighting-detail")).toHaveTextContent("detail:run-xyz")
  })
})

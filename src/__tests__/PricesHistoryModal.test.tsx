import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { PricesRun } from "@/modules/precios/types"

// Mock sonner toast
const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  }),
}))

// Drive the history hook with a controllable value.
let historyState: { data: unknown; isLoading: boolean; isError: boolean }
vi.mock("@/modules/precios/hooks/usePricesHistory", () => ({
  usePricesHistory: () => historyState,
}))

// Stub the nested detail modal — its full dependency tree is exercised by e2e.
// Here we only verify the history modal wires it (open + the selected run).
vi.mock("@/modules/precios/components/PricesDetailModal", () => ({
  PricesDetailModal: ({ run, open }: { run: PricesRun | null; open: boolean }) =>
    open && run ? <div data-testid="prices-detail">detail:{run.run_id}</div> : null,
}))

import { PricesHistoryModal } from "@/modules/precios/components/PricesHistoryModal"

const completedRun: PricesRun = {
  run_id: "run-approved-1",
  country: "chile",
  period: 202602,
  status: "approved",
  outliers: [
    { product: "Leche", declared_price: 1200, historical_avg: 800, deviation_pct: 50, reason: "spike", household_id: "HH-1" },
  ],
  outliers_count: 1,
  started_at: "2026-02-01T00:00:00Z",
  completed_at: "2026-02-01T00:02:00Z",
  created_at: "2026-02-01T00:00:00Z",
  updated_at: "2026-02-01T00:02:00Z",
}

function renderModal() {
  return render(
    <PricesHistoryModal
      country="chile"
      countryLabel="Chile"
      countryFlag="🇨🇱"
      open={true}
      onClose={() => {}}
    />,
  )
}

describe("PricesHistoryModal (JAA-424 unified history grid)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // jsdom lacks object URL APIs used by the CSV download helper.
    globalThis.URL.createObjectURL = vi.fn(() => "blob:mock")
    globalThis.URL.revokeObjectURL = vi.fn()
    historyState = { data: { items: [completedRun], total: 1, limit: 20, offset: 0 }, isLoading: false, isError: false }
  })

  it("renders the pesaje-style grid header columns", () => {
    renderModal()
    for (const col of ["Periodo", "Estado", "Fecha", "Duracion", "Resumen", "Acciones"]) {
      expect(screen.getByText(col)).toBeInTheDocument()
    }
  })

  it("renders a run row with period, status and outliers summary", () => {
    renderModal()
    expect(screen.getByText("202602")).toBeInTheDocument()
    expect(screen.getByText("Aprobado")).toBeInTheDocument()
    expect(screen.getByText("1 outliers")).toBeInTheDocument()
  })

  it("clicking the eye opens the nested PricesDetailModal for that run", async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByTitle("Ver detalle"))
    await waitFor(() => {
      expect(screen.getByTestId("prices-detail")).toHaveTextContent("detail:run-approved-1")
    })
  })

  it("shows a download action for runs with outliers and downloads a CSV", async () => {
    const user = userEvent.setup()
    renderModal()
    const dl = screen.getByTitle("Descargar CSV de outliers")
    await user.click(dl)
    await waitFor(() => {
      expect(globalThis.URL.createObjectURL).toHaveBeenCalled()
      expect(mockToastSuccess).toHaveBeenCalledWith("CSV descargado")
    })
  })

  it("hides the download action for runs without outliers", () => {
    historyState = {
      data: {
        items: [{ ...completedRun, run_id: "run-running", status: "running", outliers: [], outliers_count: 0 }],
        total: 1,
        limit: 20,
        offset: 0,
      },
      isLoading: false,
      isError: false,
    }
    renderModal()
    expect(screen.queryByTitle("Descargar CSV de outliers")).not.toBeInTheDocument()
    expect(screen.getByTitle("Ver detalle")).toBeInTheDocument()
  })

  it("shows an empty state when there are no runs", () => {
    historyState = { data: { items: [], total: 0, limit: 20, offset: 0 }, isLoading: false, isError: false }
    renderModal()
    expect(screen.getByText("No hay validaciones registradas.")).toBeInTheDocument()
  })
})

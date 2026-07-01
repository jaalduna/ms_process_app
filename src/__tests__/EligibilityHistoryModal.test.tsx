import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { EligibilityRun } from "@/modules/elegibilidad/types"

const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: (...a: unknown[]) => mockToastSuccess(...a),
    error: (...a: unknown[]) => mockToastError(...a),
  }),
}))

const mockDownloadFile = vi.fn()
vi.mock("@/lib/api", () => ({
  downloadEligibilityFile: (...a: unknown[]) => mockDownloadFile(...a),
}))

let historyState: { data: EligibilityRun[] | undefined; isLoading: boolean }
vi.mock("@/modules/elegibilidad/hooks/useEligibility", () => ({
  useEligibilityHistory: () => historyState,
}))

// Stub the nested detail modal — its full tree is exercised by e2e.
vi.mock("@/modules/elegibilidad/components/EligibilityDetailModal", () => ({
  EligibilityDetailModal: ({ run, open }: { run: EligibilityRun | null; open: boolean }) =>
    open && run ? <div data-testid="elig-detail">detail:{run.run_id}</div> : null,
}))

import { EligibilityHistoryModal } from "@/modules/elegibilidad/components/EligibilityHistoryModal"

const readyRun: EligibilityRun = {
  run_id: "run-ready-1",
  country: "mexico",
  period: 202602,
  status: "ready",
  approved_by: "system-seed",
  started_at: "2026-02-01T00:00:00Z",
  completed_at: "2026-02-01T00:02:00Z",
  created_at: "2026-02-01T00:00:00Z",
  updated_at: "2026-02-01T00:02:00Z",
  files: [
    { file_id: "f1", run_id: "run-ready-1", stage: 1, direction: "download", filename: "eligibility_results_mexico_202602.csv", stored_path: "/x", created_at: "2026-02-01T00:02:00Z" },
    { file_id: "f2", run_id: "run-ready-1", stage: 2, direction: "download", filename: "mordom_mexico_202602.csv", stored_path: "/y", created_at: "2026-02-01T00:02:00Z" },
  ],
}

function renderModal() {
  return render(
    <EligibilityHistoryModal countryCode="mexico" countryLabel="Mexico" countryFlag="🇲🇽" open={true} onOpenChange={() => {}} />,
  )
}

describe("EligibilityHistoryModal (JAA-424 new history grid)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDownloadFile.mockResolvedValue(undefined)
    historyState = { data: [readyRun], isLoading: false }
  })

  it("renders the pesaje-style grid header columns", () => {
    renderModal()
    for (const col of ["Periodo", "Estado", "Fecha", "Duracion", "Resumen", "Acciones"]) {
      expect(screen.getByText(col)).toBeInTheDocument()
    }
  })

  it("renders a run row with period and status", () => {
    renderModal()
    expect(screen.getByText("202602")).toBeInTheDocument()
    expect(screen.getByText("Aprobado por system-seed")).toBeInTheDocument()
  })

  it("clicking the eye opens the nested EligibilityDetailModal", async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByTitle("Ver detalle"))
    await waitFor(() => {
      expect(screen.getByTestId("elig-detail")).toHaveTextContent("detail:run-ready-1")
    })
  })

  it("downloads the Phase A (stage-1 download) file per row", async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByTitle("Descargar resultados (Phase A)"))
    await waitFor(() => {
      expect(mockDownloadFile).toHaveBeenCalledWith("run-ready-1", "f1", "eligibility_results_mexico_202602.csv")
      expect(mockToastSuccess).toHaveBeenCalledWith("Resultados descargados")
    })
  })

  it("hides the download action when there is no Phase A results file", () => {
    historyState = {
      data: [{ ...readyRun, run_id: "run-running", status: "running", approved_by: undefined, files: [] }],
      isLoading: false,
    }
    renderModal()
    expect(screen.queryByTitle("Descargar resultados (Phase A)")).not.toBeInTheDocument()
    expect(screen.getByTitle("Ver detalle")).toBeInTheDocument()
  })

  it("shows an empty state when there are no runs", () => {
    historyState = { data: [], isLoading: false }
    renderModal()
    expect(screen.getByText("No hay ejecuciones registradas.")).toBeInTheDocument()
  })
})

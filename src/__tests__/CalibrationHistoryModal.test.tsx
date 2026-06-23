import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { EventSummary, EventDetail } from "@/types/api"

const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: (...a: unknown[]) => mockToastSuccess(...a),
    error: (...a: unknown[]) => mockToastError(...a),
  }),
}))

const mockGetEvent = vi.fn()
const mockDownloadCalibrationReport = vi.fn()
vi.mock("@/lib/api", () => ({
  getEvent: (...a: unknown[]) => mockGetEvent(...a),
  downloadCalibrationReport: (...a: unknown[]) => mockDownloadCalibrationReport(...a),
}))

let historyState: { data: unknown; isLoading: boolean; isError: boolean }
vi.mock("@/modules/calibracion/hooks/useCalibrationHistory", () => ({
  useCalibrationHistory: () => historyState,
}))

// Stub the nested detail modal — its full tree is exercised by e2e.
vi.mock("@/modules/calibracion/components/CalibrationDetailModal", () => ({
  CalibrationDetailModal: ({ job, open }: { job: EventDetail | undefined; open: boolean }) =>
    open && job ? <div data-testid="calib-detail">detail:{job.job_id}</div> : null,
}))

import { CalibrationHistoryModal } from "@/modules/calibracion/components/CalibrationHistoryModal"

const completedEvent: EventSummary = {
  job_id: "job-1",
  status: "completed",
  country: "mexico",
  stage: "calibracion",
  tag: "tag-1",
  period: "202602",
  queries_total: 6,
  queries_completed: 6,
  queries_failed: 0,
  created_at: "2026-02-01T00:00:00Z",
  started_at: "2026-02-01T00:00:00Z",
  completed_at: "2026-02-01T00:01:00Z",
  triggered_by: "system-seed",
  error: null,
  current_query: null,
  failed_queries: [],
  running_queries: [],
  queries_running: 0,
  total_rows_extracted: 12345,
}

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={qc}>
      <CalibrationHistoryModal country="mexico" countryLabel="Mexico" countryFlag="🇲🇽" open={true} onClose={() => {}} />
    </QueryClientProvider>,
  )
}

describe("CalibrationHistoryModal (JAA-424 unified history grid)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetEvent.mockResolvedValue({ ...completedEvent } as EventDetail)
    mockDownloadCalibrationReport.mockResolvedValue(undefined)
    historyState = { data: { items: [completedEvent], total: 1, limit: 20, offset: 0 }, isLoading: false, isError: false }
  })

  it("renders the pesaje-style grid header columns", () => {
    renderModal()
    for (const col of ["Periodo", "Estado", "Fecha", "Duracion", "Resumen", "Acciones"]) {
      expect(screen.getByText(col)).toBeInTheDocument()
    }
  })

  it("renders a row with period, status and rows summary", () => {
    renderModal()
    expect(screen.getByText("202602")).toBeInTheDocument()
    expect(screen.getByText("Completed")).toBeInTheDocument()
    expect(screen.getByText("12,345 filas")).toBeInTheDocument()
  })

  it("clicking the eye fetches the EventDetail and opens CalibrationDetailModal", async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByTitle("Ver detalle"))
    await waitFor(() => {
      expect(mockGetEvent).toHaveBeenCalledWith("job-1")
      expect(screen.getByTestId("calib-detail")).toHaveTextContent("detail:job-1")
    })
  })

  it("clicking download streams the real calibration zip via tag + country", async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByTitle("Descargar resultados"))
    await waitFor(() => {
      expect(mockDownloadCalibrationReport).toHaveBeenCalledWith("tag-1", "mexico")
      expect(mockToastSuccess).toHaveBeenCalled()
    })
  })

  it("hides download for non-completed runs but keeps the eye", () => {
    historyState = {
      data: { items: [{ ...completedEvent, job_id: "job-run", status: "running", completed_at: null }], total: 1, limit: 20, offset: 0 },
      isLoading: false,
      isError: false,
    }
    renderModal()
    expect(screen.queryByTitle("Descargar resultados")).not.toBeInTheDocument()
    expect(screen.getByTitle("Ver detalle")).toBeInTheDocument()
  })
})

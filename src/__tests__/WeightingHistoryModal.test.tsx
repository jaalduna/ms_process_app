import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { WeightingRun } from "@/modules/pesaje/types"

const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: (...a: unknown[]) => mockToastSuccess(...a),
    error: (...a: unknown[]) => mockToastError(...a),
  }),
}))

const mockDownloadWeightingCSV = vi.fn()
const mockPatchWeightingRun = vi.fn()
vi.mock("@/lib/api", () => ({
  downloadWeightingCSV: (...a: unknown[]) => mockDownloadWeightingCSV(...a),
  patchWeightingRun: (...a: unknown[]) => mockPatchWeightingRun(...a),
}))

let runsState: { data: WeightingRun[] | undefined; isLoading: boolean }
vi.mock("@/modules/pesaje/hooks/useWeighting", () => ({
  useWeightingRuns: () => runsState,
}))

vi.mock("@/modules/pesaje/components/WeightingDetailModal", () => ({
  WeightingDetailModal: ({ run, open }: { run: WeightingRun | null; open: boolean }) =>
    open && run ? <div data-testid="weighting-detail">detail:{run.run_id}</div> : null,
}))

import { WeightingHistoryModal } from "@/modules/pesaje/components/WeightingHistoryModal"

const completedRun: WeightingRun = {
  run_id: "run-1",
  country: "chile",
  period: 202602,
  status: "completed",
  summary_stats: {
    total_households: 1000,
    weighted_households: 990,
    min_weight: 10,
    max_weight: 100,
    mean_weight: 55,
    median_weight: 50,
    std_dev: 12,
  },
  created_at: "2026-02-01T00:00:00Z",
  updated_at: "2026-02-01T00:01:00Z",
  started_at: "2026-02-01T00:00:00Z",
  completed_at: "2026-02-01T00:01:00Z",
}

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={qc}>
      <WeightingHistoryModal countryCode="chile" open={true} onOpenChange={() => {}} />
    </QueryClientProvider>,
  )
}

describe("WeightingHistoryModal final toggle + label (JAA-755)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDownloadWeightingCSV.mockResolvedValue(undefined)
    mockPatchWeightingRun.mockResolvedValue({ ...completedRun, is_final: true })
    runsState = { data: [completedRun], isLoading: false }
  })

  it("renders the Final and Etiqueta columns", () => {
    renderModal()
    expect(screen.getByText("Final")).toBeInTheDocument()
    expect(screen.getByText("Etiqueta")).toBeInTheDocument()
  })

  it("clicking the star marks the row final via patchWeightingRun(runId, { is_final: true })", async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByTitle("Marcar como final"))
    await waitFor(() => {
      expect(mockPatchWeightingRun).toHaveBeenCalledWith("run-1", { is_final: true })
    })
  })

  it("un-marks a row that is currently final via patchWeightingRun(runId, { is_final: false })", async () => {
    runsState = { data: [{ ...completedRun, is_final: true }], isLoading: false }
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByTitle("Corrida final"))
    await waitFor(() => {
      expect(mockPatchWeightingRun).toHaveBeenCalledWith("run-1", { is_final: false })
    })
  })

  it("only one row shows as final when a sibling was already marked (exclusive after refetch)", () => {
    runsState = {
      data: [
        { ...completedRun, run_id: "run-1", is_final: false },
        { ...completedRun, run_id: "run-2", is_final: true },
      ],
      isLoading: false,
    }
    renderModal()
    const finalButtons = screen.getAllByRole("button", { name: /marcar como final|quitar marca de final/i })
    expect(finalButtons[0]).toHaveAttribute("aria-pressed", "false")
    expect(finalButtons[1]).toHaveAttribute("aria-pressed", "true")
  })

  it("editing the label and blurring calls patchWeightingRun with the new label", async () => {
    const user = userEvent.setup()
    renderModal()
    const input = screen.getByLabelText(/Etiqueta para el pesaje/i)
    await user.type(input, "aprobada por X")
    await user.tab()
    await waitFor(() => {
      expect(mockPatchWeightingRun).toHaveBeenCalledWith("run-1", { label: "aprobada por X" })
    })
  })
})

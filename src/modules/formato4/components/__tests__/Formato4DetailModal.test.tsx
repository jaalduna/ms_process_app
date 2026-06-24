import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

// Mock sonner toast
const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
const mockToastInfo = vi.fn()
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: (...a: unknown[]) => mockToastSuccess(...a),
    error: (...a: unknown[]) => mockToastError(...a),
    info: (...a: unknown[]) => mockToastInfo(...a),
  }),
}))

// Mock API — the modal drives real react-query hooks against these.
const mockGetFormato4Run = vi.fn()
const mockCreateFormato4Run = vi.fn()
const mockExecuteFormato4 = vi.fn()
const mockCancelFormato4 = vi.fn()
const mockDownloadFormato4 = vi.fn()

vi.mock("@/lib/api", () => ({
  getFormato4Runs: vi.fn(),
  getFormato4Run: (...a: unknown[]) => mockGetFormato4Run(...a),
  createFormato4Run: (...a: unknown[]) => mockCreateFormato4Run(...a),
  executeFormato4: (...a: unknown[]) => mockExecuteFormato4(...a),
  cancelFormato4: (...a: unknown[]) => mockCancelFormato4(...a),
  downloadFormato4: (...a: unknown[]) => mockDownloadFormato4(...a),
  setTokenProvider: vi.fn(),
  api: { interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } },
}))

import { Formato4DetailModal } from "../Formato4DetailModal"

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

const completedRun = (extra: Record<string, unknown> = {}) => ({
  run_id: "run-1",
  country: "chile",
  period: 202602,
  status: "completed",
  steps: [
    { name: "sync", status: "completed", started_at: "2026-01-01T00:00:00Z", completed_at: "2026-01-01T00:01:00Z" },
    { name: "merge", status: "completed", started_at: "2026-01-01T00:01:00Z", completed_at: "2026-01-01T00:02:00Z" },
    { name: "simulate", status: "completed", started_at: "2026-01-01T00:02:00Z", completed_at: "2026-01-01T00:03:00Z" },
    { name: "format_4", status: "completed", started_at: "2026-01-01T00:03:00Z", completed_at: "2026-01-01T00:04:00Z" },
    { name: "zip", status: "completed", started_at: "2026-01-01T00:04:00Z", completed_at: "2026-01-01T00:05:00Z" },
  ],
  current_step: "zip",
  started_at: "2026-01-01T00:00:00Z",
  completed_at: "2026-01-01T00:05:00Z",
  results_summary: {
    country: "chile",
    period: 202602,
    row_count: 54321,
    generated_at: "2026-01-01T00:05:00Z",
    sim_wheel_version: "3.0.0-dev-gold",
  },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:05:00Z",
  ...extra,
})

function renderModal(runId: string | null = "run-1") {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <Formato4DetailModal runId={runId} open={true} onOpenChange={() => {}} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetFormato4Run.mockResolvedValue(completedRun())
})

describe("Formato4DetailModal", () => {
  it("renders nothing while the run has not loaded", () => {
    mockGetFormato4Run.mockResolvedValue(null)
    renderModal()
    expect(screen.queryByText(/Formato 4 Detail/i)).not.toBeInTheDocument()
  })

  it("does not fetch when runId is null", () => {
    renderModal(null)
    expect(mockGetFormato4Run).not.toHaveBeenCalled()
  })

  it("renders run metadata and the pipeline progress driven by useFormato4Run", async () => {
    renderModal()
    await waitFor(() => expect(screen.getByText(/Formato 4 Detail/i)).toBeInTheDocument())
    expect(mockGetFormato4Run).toHaveBeenCalledWith("run-1")
    expect(screen.getByText("Chile")).toBeInTheDocument()
    expect(screen.getByText("202602")).toBeInTheDocument()
    expect(screen.getByText("Completado")).toBeInTheDocument()
    // Formato4Progress dots (5 steps)
    expect(screen.getAllByTestId("formato4-step-dot")).toHaveLength(5)
  })

  it("renders the results_summary grid (row_count + sim wheel version) when completed", async () => {
    renderModal()
    await waitFor(() => expect(screen.getByText(/Formato 4 Detail/i)).toBeInTheDocument())
    expect(screen.getByText("54,321")).toBeInTheDocument()
    expect(screen.getByText("3.0.0-dev-gold")).toBeInTheDocument()
  })

  it("download button calls the server downloadFormato4(run_id, country) + success toast", async () => {
    const user = userEvent.setup()
    mockDownloadFormato4.mockResolvedValue(undefined)
    renderModal()
    const btn = await screen.findByRole("button", { name: /Descargar/ })
    await user.click(btn)
    await waitFor(() => expect(mockDownloadFormato4).toHaveBeenCalledWith("run-1", "chile"))
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled())
  })

  it("download failure surfaces an error toast", async () => {
    const user = userEvent.setup()
    mockDownloadFormato4.mockRejectedValue(new Error("boom"))
    renderModal()
    await user.click(await screen.findByRole("button", { name: /Descargar/ }))
    await waitFor(() => expect(mockToastError).toHaveBeenCalled())
  })

  it("a failed run shows the error message and a Retry action", async () => {
    mockGetFormato4Run.mockResolvedValue(
      completedRun({
        status: "failed",
        completed_at: "2026-01-01T00:03:00Z",
        results_summary: null,
        error_message: "Pipeline failed at step: simulate",
        steps: [
          { name: "sync", status: "completed", started_at: "2026-01-01T00:00:00Z", completed_at: "2026-01-01T00:01:00Z" },
          { name: "merge", status: "completed", started_at: "2026-01-01T00:01:00Z", completed_at: "2026-01-01T00:02:00Z" },
          { name: "simulate", status: "failed", started_at: "2026-01-01T00:02:00Z", error: "boom" },
        ],
      }),
    )
    renderModal()
    await waitFor(() => expect(screen.getByText(/Pipeline failed at step: simulate/)).toBeInTheDocument())
    expect(screen.getByRole("button", { name: /Retry/ })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Descargar/ })).not.toBeInTheDocument()
  })
})

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
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

// Mock API — the card drives real react-query hooks against these.
const mockGetFormato4Runs = vi.fn()
const mockGetFormato4Run = vi.fn()
const mockCreateFormato4Run = vi.fn()
const mockExecuteFormato4 = vi.fn()
const mockCancelFormato4 = vi.fn()
const mockDownloadFormato4 = vi.fn()
const mockGetProcessStatus = vi.fn()

vi.mock("@/lib/api", () => ({
  getFormato4Runs: (...a: unknown[]) => mockGetFormato4Runs(...a),
  getFormato4Run: (...a: unknown[]) => mockGetFormato4Run(...a),
  createFormato4Run: (...a: unknown[]) => mockCreateFormato4Run(...a),
  executeFormato4: (...a: unknown[]) => mockExecuteFormato4(...a),
  cancelFormato4: (...a: unknown[]) => mockCancelFormato4(...a),
  downloadFormato4: (...a: unknown[]) => mockDownloadFormato4(...a),
  getLastFormato4: vi.fn().mockResolvedValue({ countries: {} }),
  getProcessStatus: (...a: unknown[]) => mockGetProcessStatus(...a),
  openProcess: vi.fn(),
  closeProcess: vi.fn(),
  setTokenProvider: vi.fn(),
  api: { interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } },
}))

import { Formato4CountryCard } from "../Formato4CountryCard"

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function renderCard(overrides?: { countryCode?: string; period?: string; lastFormato4Date?: string | null }) {
  const queryClient = createTestQueryClient()
  const props = {
    countryCode: overrides?.countryCode ?? "chile",
    period: overrides?.period ?? "202602",
    lastFormato4Date: overrides?.lastFormato4Date ?? null,
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Formato4CountryCard {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const baseRun = (status: string, extra: Record<string, unknown> = {}) => ({
  run_id: "run-1",
  country: "chile",
  period: 202602,
  status,
  steps: [],
  current_step: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockGetFormato4Runs.mockResolvedValue({ items: [], total: 0 })
  mockGetFormato4Run.mockResolvedValue(null)
  mockGetProcessStatus.mockResolvedValue({ countries: {} })
})

describe("Formato4CountryCard", () => {
  // --- Card surface ---------------------------------------------------------

  it("renders the country name and flag", async () => {
    renderCard()
    await waitFor(() => expect(screen.getByText("Chile")).toBeInTheDocument())
  })

  it('shows "never" when there is no last formato4 date', async () => {
    renderCard({ lastFormato4Date: null })
    await waitFor(() => expect(screen.getByText("never")).toBeInTheDocument())
  })

  it("shows a relative time when a last formato4 date is provided", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    renderCard({ lastFormato4Date: twoHoursAgo })
    await waitFor(() => expect(screen.getByText("2h ago")).toBeInTheDocument())
  })

  it("renders the ProcessStatusBadge for stage=formato4", async () => {
    renderCard()
    // The badge surfaces the open/close control (default: no entry => "Abrir"/"Cerrado" toggle).
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Abrir|Cerrar|Abierto|Cerrado/ })).toBeInTheDocument(),
    )
  })

  // --- State machine (ac2) --------------------------------------------------

  it("idle (no runs): shows an enabled 'Ejecutar' button and no Stop", async () => {
    mockGetFormato4Runs.mockResolvedValue({ items: [], total: 0 })
    renderCard()
    await waitFor(() => expect(screen.getByRole("button", { name: "Ejecutar" })).toBeEnabled())
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument()
  })

  it("pending: shows disabled 'Starting...' + Stop", async () => {
    mockGetFormato4Runs.mockResolvedValue({ items: [baseRun("pending")], total: 1 })
    renderCard()
    await waitFor(() => expect(screen.getByText("Starting...")).toBeInTheDocument())
    expect(screen.getByRole("button", { name: /Stop/ })).toBeInTheDocument()
    expect(screen.getByText("Pendiente")).toBeInTheDocument()
  })

  it("running: shows 'Running...' + Stop + the Formato4Progress dots", async () => {
    mockGetFormato4Runs.mockResolvedValue({
      items: [
        baseRun("running", {
          steps: [
            { name: "sync", status: "completed" },
            { name: "merge", status: "running" },
          ],
          current_step: "merge",
        }),
      ],
      total: 1,
    })
    renderCard()
    await waitFor(() => expect(screen.getByText("Running...")).toBeInTheDocument())
    expect(screen.getByRole("button", { name: /Stop/ })).toBeInTheDocument()
    expect(screen.getByText("Ejecutando...")).toBeInTheDocument()
    // 5 step dots from FORMATO4_STEPS
    expect(screen.getAllByTestId("formato4-step-dot")).toHaveLength(5)
  })

  it("completed: shows the green 'Completado' badge and an 'Ejecutar' (re-run) button", async () => {
    mockGetFormato4Runs.mockResolvedValue({ items: [baseRun("completed")], total: 1 })
    renderCard()
    await waitFor(() => expect(screen.getByText("Completado")).toBeInTheDocument())
    expect(screen.getByRole("button", { name: "Ejecutar" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Stop/ })).not.toBeInTheDocument()
  })

  it("failed: shows the 'Error' badge, the error message and an 'Ejecutar' (retry) button", async () => {
    mockGetFormato4Runs.mockResolvedValue({
      items: [baseRun("failed", { error_message: "Pipeline failed at step: simulate" })],
      total: 1,
    })
    renderCard()
    await waitFor(() => expect(screen.getByText("Error")).toBeInTheDocument())
    expect(screen.getByText("Pipeline failed at step: simulate")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Ejecutar" })).toBeInTheDocument()
  })

  it("cancelled: shows the 'Cancelado' badge and an 'Ejecutar' button", async () => {
    mockGetFormato4Runs.mockResolvedValue({ items: [baseRun("cancelled")], total: 1 })
    renderCard()
    await waitFor(() => expect(screen.getByText("Cancelado")).toBeInTheDocument())
    expect(screen.getByRole("button", { name: "Ejecutar" })).toBeInTheDocument()
  })

  // --- Run flow (ac3) -------------------------------------------------------

  it("Ejecutar -> confirm -> creates then executes the run with {country, period}", async () => {
    const user = userEvent.setup()
    mockGetFormato4Runs.mockResolvedValue({ items: [], total: 0 })
    mockCreateFormato4Run.mockResolvedValue({ run_id: "r1", country: "chile", status: "pending" })
    mockExecuteFormato4.mockResolvedValue({ run_id: "r1", country: "chile", status: "running" })

    renderCard()
    await user.click(await screen.findByRole("button", { name: "Ejecutar" }))

    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText("Confirm Formato 4")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }))

    await waitFor(() =>
      expect(mockCreateFormato4Run).toHaveBeenCalledWith({ country: "chile", period: 202602 }),
    )
    await waitFor(() => expect(mockExecuteFormato4).toHaveBeenCalledWith("r1"))
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled())
  })

  it("does NOT send a parameters field (formato4 has no params)", async () => {
    const user = userEvent.setup()
    mockGetFormato4Runs.mockResolvedValue({ items: [], total: 0 })
    mockCreateFormato4Run.mockResolvedValue({ run_id: "r1", country: "chile", status: "pending" })
    mockExecuteFormato4.mockResolvedValue({ run_id: "r1", country: "chile", status: "running" })

    renderCard()
    await user.click(await screen.findByRole("button", { name: "Ejecutar" }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }))

    await waitFor(() => expect(mockCreateFormato4Run).toHaveBeenCalled())
    const arg = mockCreateFormato4Run.mock.calls[0][0]
    expect(arg).not.toHaveProperty("parameters")
  })

  // --- Download zip (MTR-32) ------------------------------------------------

  it("completed: renders a Download button that fetches the server zip + success toast", async () => {
    const user = userEvent.setup()
    mockGetFormato4Runs.mockResolvedValue({ items: [baseRun("completed")], total: 1 })
    mockDownloadFormato4.mockResolvedValue(undefined)

    renderCard()
    const downloadBtn = await screen.findByRole("button", { name: /Descargar/ })
    await user.click(downloadBtn)

    await waitFor(() => expect(mockDownloadFormato4).toHaveBeenCalledWith("run-1", "chile"))
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled())
  })

  it("completed: download failure surfaces an error toast", async () => {
    const user = userEvent.setup()
    mockGetFormato4Runs.mockResolvedValue({ items: [baseRun("completed")], total: 1 })
    mockDownloadFormato4.mockRejectedValue(new Error("boom"))

    renderCard()
    await user.click(await screen.findByRole("button", { name: /Descargar/ }))

    await waitFor(() => expect(mockToastError).toHaveBeenCalled())
  })

  it("does NOT render a Download button when the run is not completed", async () => {
    mockGetFormato4Runs.mockResolvedValue({ items: [baseRun("running")], total: 1 })
    renderCard()
    await waitFor(() => expect(screen.getByText("Ejecutando...")).toBeInTheDocument())
    expect(screen.queryByRole("button", { name: /Descargar/ })).not.toBeInTheDocument()
  })

  // --- Stop flow (ac3) ------------------------------------------------------

  it("Stop -> confirm -> cancels the running run by run_id", async () => {
    const user = userEvent.setup()
    mockGetFormato4Runs.mockResolvedValue({ items: [baseRun("running")], total: 1 })
    mockCancelFormato4.mockResolvedValue(baseRun("cancelled"))

    renderCard()
    await user.click(await screen.findByRole("button", { name: /Stop/ }))

    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText("Stop Formato 4")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Stop" }))

    await waitFor(() => expect(mockCancelFormato4).toHaveBeenCalledWith("run-1"))
  })

  // --- Detail modal (MTR-33) ------------------------------------------------

  it("completed: an Eye (view detail) button opens the Formato4DetailModal for that run", async () => {
    const user = userEvent.setup()
    mockGetFormato4Runs.mockResolvedValue({ items: [baseRun("completed")], total: 1 })
    mockGetFormato4Run.mockResolvedValue(
      baseRun("completed", {
        results_summary: {
          country: "chile",
          period: 202602,
          row_count: 12345,
          generated_at: "2026-01-01T00:00:00Z",
          sim_wheel_version: "3.0.0-dev-gold",
        },
      }),
    )

    renderCard()
    const eye = await screen.findByRole("button", { name: /Ver detalle/ })
    await user.click(eye)

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText(/Formato 4 Detail/i)).toBeInTheDocument()
    await waitFor(() => expect(mockGetFormato4Run).toHaveBeenCalledWith("run-1"))
  })

  it("does NOT render the Eye (view detail) button before a run exists", async () => {
    mockGetFormato4Runs.mockResolvedValue({ items: [], total: 0 })
    renderCard()
    await waitFor(() => expect(screen.getByRole("button", { name: "Ejecutar" })).toBeInTheDocument())
    expect(screen.queryByRole("button", { name: /Ver detalle/ })).not.toBeInTheDocument()
  })
})

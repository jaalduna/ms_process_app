import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

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
const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
const mockToastInfo = vi.fn()
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
    info: (...args: unknown[]) => mockToastInfo(...args),
  }),
}))

// Mock API
const mockGetWeightingRuns = vi.fn()
const mockCreateWeightingRun = vi.fn()
const mockExecuteWeighting = vi.fn()
const mockCancelWeighting = vi.fn()
const mockGetWeightingRun = vi.fn()
const mockGetProcessStatus = vi.fn()
const mockCloseProcess = vi.fn()

vi.mock("@/lib/api", () => ({
  getWeightingRuns: (...args: unknown[]) => mockGetWeightingRuns(...args),
  getWeightingRun: (...args: unknown[]) => mockGetWeightingRun(...args),
  createWeightingRun: (...args: unknown[]) => mockCreateWeightingRun(...args),
  executeWeighting: (...args: unknown[]) => mockExecuteWeighting(...args),
  cancelWeighting: (...args: unknown[]) => mockCancelWeighting(...args),
  getLastWeighting: vi.fn().mockResolvedValue({ countries: {} }),
  downloadWeightingCSV: vi.fn(),
  getProcessStatus: (...args: unknown[]) => mockGetProcessStatus(...args),
  openProcess: vi.fn(),
  closeProcess: (...args: unknown[]) => mockCloseProcess(...args),
  setTokenProvider: vi.fn(),
  api: { interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } },
}))

import { WeightingCountryCard } from "@/modules/pesaje/components/WeightingCountryCard"
import { DEFAULT_WEIGHTING_PARAMS } from "@/modules/pesaje/weightingParams"

const DEFAULT_PARAMS = DEFAULT_WEIGHTING_PARAMS

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function renderCard(overrides?: {
  countryCode?: string
  period?: string
  lastFinalizedDate?: string | null
}) {
  const queryClient = createTestQueryClient()

  const props = {
    countryCode: overrides?.countryCode ?? "chile",
    period: overrides?.period ?? "202602",
    lastFinalizedDate: overrides?.lastFinalizedDate ?? null,
  }

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <WeightingCountryCard {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const completedRun = (parameters_json: Record<string, unknown> = {}) => ({
  run_id: "run-done-1",
  country: "chile",
  period: 202602,
  status: "completed",
  steps: [],
  current_step: null,
  parameters_json,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:05:00Z",
  completed_at: "2026-01-01T00:05:00Z",
})

const runningRun = () => ({
  run_id: "run-1",
  country: "chile",
  period: 202602,
  status: "running",
  steps: [],
  current_step: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
})

/** The clickable card surface (role=button with the country aria-label). */
function getCard() {
  return screen.getByRole("button", { name: /Abrir detalle de Pesaje/ })
}

describe("WeightingCountryCard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetWeightingRuns.mockResolvedValue([])
    mockGetWeightingRun.mockResolvedValue(null)
    mockGetProcessStatus.mockResolvedValue({ countries: {} })
    mockCloseProcess.mockResolvedValue({})
  })

  // --- Card surface ---------------------------------------------------------

  it("renders country name and flag", async () => {
    renderCard()
    await waitFor(() => expect(screen.getByText("Chile")).toBeInTheDocument())
  })

  it('shows "never" when no last weighting date', async () => {
    renderCard({ lastFinalizedDate: null })
    await waitFor(() => expect(screen.getByText("never")).toBeInTheDocument())
  })

  it("shows relative time when last weighting date is provided", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    renderCard({ lastFinalizedDate: twoHoursAgo })
    await waitFor(() => expect(screen.getByText("2h ago")).toBeInTheDocument())
  })

  it("the card carries NO 'Configurar parametros' nor 'Marcar como listo' buttons (ac1)", async () => {
    mockGetWeightingRuns.mockResolvedValue([completedRun()])
    renderCard()
    await waitFor(() => expect(getCard()).toBeInTheDocument())
    expect(screen.queryByRole("button", { name: /Configurar par/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Marcar como listo/i })).not.toBeInTheDocument()
  })

  // --- Card click opens the dialog (ac2) -----------------------------------

  it("clicking the card opens the detail dialog", async () => {
    const user = userEvent.setup()
    renderCard()
    await waitFor(() => expect(getCard()).toBeInTheDocument())

    await user.click(getCard())
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText("Configurar Pesaje")).toBeInTheDocument()
  })

  it("clicking the status badge does NOT open the detail dialog (stopPropagation, ac2)", async () => {
    const user = userEvent.setup()
    renderCard()
    await waitFor(() => expect(getCard()).toBeInTheDocument())

    // The open/close badge ("Cerrado" since there is no process entry) opens its own
    // confirmation, not the detail dialog.
    await user.click(screen.getByRole("button", { name: /Cerrado/ }))
    const alert = await screen.findByRole("alertdialog")
    expect(within(alert).getByRole("heading", { name: "Abrir proceso" })).toBeInTheDocument()
    expect(screen.queryByText("Configurar Pesaje")).not.toBeInTheDocument()
    expect(screen.queryByText("Detalle Pesaje")).not.toBeInTheDocument()
  })

  it("clicking the History icon does NOT open the detail dialog (stopPropagation, ac2)", async () => {
    const user = userEvent.setup()
    mockGetWeightingRuns.mockResolvedValue([completedRun()])
    renderCard()

    await user.click(await screen.findByRole("button", { name: "Historial" }))
    expect(await screen.findByText(/Historial de Pesaje/)).toBeInTheDocument()
    expect(screen.queryByText("Detalle Pesaje")).not.toBeInTheDocument()
  })

  // --- Dialog: Ejecutar vs Re-ejecutar (ac3) -------------------------------

  it("dialog shows 'Ejecutar' when the country has no prior run (ac3)", async () => {
    const user = userEvent.setup()
    mockGetWeightingRuns.mockResolvedValue([])
    renderCard()
    await waitFor(() => expect(getCard()).toBeInTheDocument())

    await user.click(getCard())
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByRole("button", { name: "Ejecutar" })).toBeInTheDocument()
    expect(within(dialog).queryByRole("button", { name: "Re-ejecutar" })).not.toBeInTheDocument()
    // Params are read-only here (editable only from the Parametros tab).
    expect(within(dialog).getByText("MAX_ROUNDS_COLAPSO")).toBeInTheDocument()
    expect(within(dialog).getByText(String(DEFAULT_PARAMS.MAX_ROUNDS_COLAPSO))).toBeInTheDocument()
    expect(within(dialog).queryByLabelText("MAX_ROUNDS_COLAPSO")).not.toBeInTheDocument()
  })

  it("dialog shows 'Re-ejecutar' once the latest run is completed (ac3)", async () => {
    const user = userEvent.setup()
    mockGetWeightingRuns.mockResolvedValue([completedRun()])
    renderCard()
    await waitFor(() => expect(getCard()).toBeInTheDocument())

    await user.click(getCard())
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByRole("button", { name: "Re-ejecutar" })).toBeInTheDocument()
  })

  it("re-run dialog shows the currently published defaults, not the prior run's params (ac3)", async () => {
    const user = userEvent.setup()
    // The prior run was launched with an overridden value, but nothing has been
    // (re)published since — the modal shows the F-001 default, not that override.
    mockGetWeightingRuns.mockResolvedValue([completedRun({ MAX_ROUNDS_COLAPSO: 99 })])
    renderCard()
    await waitFor(() => expect(getCard()).toBeInTheDocument())

    await user.click(getCard())
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText(String(DEFAULT_PARAMS.MAX_ROUNDS_COLAPSO))).toBeInTheDocument()
  })

  // --- Dialog: launch with the published params (ac4) ----------------------

  it("running from the dialog posts the published params via create + execute (ac4)", async () => {
    const user = userEvent.setup()
    mockGetWeightingRuns.mockResolvedValue([])
    mockCreateWeightingRun.mockResolvedValue({ run_id: "r1", country: "chile", status: "pending" })
    mockExecuteWeighting.mockResolvedValue({ run_id: "r1", status: "running" })

    renderCard()
    await waitFor(() => expect(getCard()).toBeInTheDocument())

    await user.click(getCard())
    const dialog = await screen.findByRole("dialog")

    await user.click(within(dialog).getByRole("button", { name: "Ejecutar" }))
    const confirm = await screen.findByRole("alertdialog")
    expect(within(confirm).getByText("Ejecutar pipeline")).toBeInTheDocument()
    await user.click(within(confirm).getByRole("button", { name: "Ejecutar" }))

    await waitFor(() => {
      expect(mockCreateWeightingRun).toHaveBeenCalledWith(
        expect.objectContaining({
          country: "chile",
          period: 202602,
          parameters: expect.objectContaining({ MAX_ROUNDS_COLAPSO: DEFAULT_PARAMS.MAX_ROUNDS_COLAPSO }),
        }),
      )
    })
    await waitFor(() => expect(mockExecuteWeighting).toHaveBeenCalledWith("r1"))
  })

  // --- Closed process => read-only dialog (ac5) ----------------------------

  it("closed process => dialog params are read-only and no run button (ac5)", async () => {
    const user = userEvent.setup()
    mockGetWeightingRuns.mockResolvedValue([completedRun({ MAX_ROUNDS_COLAPSO: 50 })])
    mockGetProcessStatus.mockResolvedValue({
      countries: { chile: { pesaje: { status: "closed", changed_by: "Ana", changed_at: "2026-01-02T00:00:00Z" } } },
    })

    renderCard()
    await waitFor(() => expect(getCard()).toBeInTheDocument())

    await user.click(getCard())
    const dialog = await screen.findByRole("dialog")
    // Param shown read-only (label text present, but not as an editable input).
    expect(within(dialog).getByText("MAX_ROUNDS_COLAPSO")).toBeInTheDocument()
    expect(within(dialog).queryByLabelText("MAX_ROUNDS_COLAPSO")).not.toBeInTheDocument()
    expect(within(dialog).queryByRole("button", { name: "Re-ejecutar" })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole("button", { name: "Ejecutar" })).not.toBeInTheDocument()
  })

  // --- Inline status / progress / processing (kept on the card) ------------

  it("shows status badge for a running run", async () => {
    mockGetWeightingRuns.mockResolvedValue([
      {
        ...runningRun(),
        steps: [
          { name: "load_eligible", status: "completed", started_at: "2026-01-01T00:00:00Z", completed_at: "2026-01-01T00:01:00Z" },
          { name: "calculate_weights", status: "running", started_at: "2026-01-01T00:01:00Z" },
        ],
        current_step: "calculate_weights",
      },
    ])
    renderCard()
    await waitFor(() => expect(screen.getByText("Ejecutando...")).toBeInTheDocument())
  })

  it("shows Detener button when run is processing", async () => {
    mockGetWeightingRuns.mockResolvedValue([runningRun()])
    renderCard()
    await waitFor(() => expect(screen.getByText("Detener")).toBeInTheDocument())
  })

  it("confirming Detener cancels the running run", async () => {
    const user = userEvent.setup()
    mockGetWeightingRuns.mockResolvedValue([runningRun()])
    mockCancelWeighting.mockResolvedValue({ run_id: "run-1", status: "cancelled" })

    renderCard()

    await user.click(await screen.findByText("Detener"))
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText("Detener ejecucion")).toBeInTheDocument()

    await user.click(within(dialog).getByRole("button", { name: "Detener" }))
    await waitFor(() => expect(mockCancelWeighting).toHaveBeenCalledWith("run-1"))
  })

  it("action row wraps so Detener does not clip off the card while processing", async () => {
    mockGetWeightingRuns.mockResolvedValue([runningRun()])
    renderCard()

    const detener = await screen.findByText("Detener")
    const actionRow = detener.closest("div.flex")
    expect(actionRow).not.toBeNull()
    expect(actionRow).toHaveClass("flex-wrap")
  })

  it("shows error message when run has failed", async () => {
    mockGetWeightingRuns.mockResolvedValue([
      {
        run_id: "run-1",
        country: "chile",
        period: 202602,
        status: "failed",
        steps: [],
        current_step: null,
        error_message: "Pipeline failed at step: calculate_weights",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ])
    renderCard()
    await waitFor(() => {
      expect(screen.getByText("Pipeline failed at step: calculate_weights")).toBeInTheDocument()
    })
  })
})

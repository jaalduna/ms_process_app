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

describe("WeightingCountryCard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetWeightingRuns.mockResolvedValue([])
    mockGetProcessStatus.mockResolvedValue({ countries: {} })
    mockCloseProcess.mockResolvedValue({})
  })

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

  it("renders country name and flag", async () => {
    renderCard()

    await waitFor(() => {
      expect(screen.getByText("Chile")).toBeInTheDocument()
    })
  })

  it('shows "never" when no last weighting date', async () => {
    renderCard({ lastFinalizedDate: null })

    await waitFor(() => {
      expect(screen.getByText("never")).toBeInTheDocument()
    })
  })

  it("shows relative time when last weighting date is provided", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    renderCard({ lastFinalizedDate: twoHoursAgo })

    await waitFor(() => {
      expect(screen.getByText("2h ago")).toBeInTheDocument()
    })
  })

  it('shows "Ejecutar" button when no active run', async () => {
    mockGetWeightingRuns.mockResolvedValue([])

    renderCard()

    await waitFor(() => {
      expect(screen.getByText("Ejecutar")).toBeInTheDocument()
    })
  })

  it("clicking Ejecutar opens confirmation dialog", async () => {
    const user = userEvent.setup()
    mockGetWeightingRuns.mockResolvedValue([])

    renderCard()

    await waitFor(() => {
      expect(screen.getByText("Ejecutar")).toBeInTheDocument()
    })

    await user.click(screen.getByText("Ejecutar"))

    await waitFor(() => {
      expect(screen.getByText("Confirmar ejecucion")).toBeInTheDocument()
    })
  })

  it("confirming execution calls createWeightingRun then executeWeighting", async () => {
    const user = userEvent.setup()
    mockGetWeightingRuns.mockResolvedValue([])
    const mockRun = { run_id: "test-run-1", country: "chile", status: "pending" }
    mockCreateWeightingRun.mockResolvedValue(mockRun)
    mockExecuteWeighting.mockResolvedValue({ ...mockRun, status: "running" })

    renderCard()

    await waitFor(() => {
      expect(screen.getByText("Ejecutar")).toBeInTheDocument()
    })

    await user.click(screen.getByText("Ejecutar"))

    await waitFor(() => {
      expect(screen.getByText("Confirmar")).toBeInTheDocument()
    })

    await user.click(screen.getByText("Confirmar"))

    await waitFor(() => {
      expect(mockCreateWeightingRun).toHaveBeenCalledWith({
        country: "chile",
        period: 202602,
        parameters: DEFAULT_PARAMS,
      })
    })

    await waitFor(() => {
      expect(mockExecuteWeighting).toHaveBeenCalledWith("test-run-1")
    })
  })

  it("shows status badge for a running run", async () => {
    mockGetWeightingRuns.mockResolvedValue([
      {
        run_id: "run-1",
        country: "chile",
        period: 202602,
        status: "running",
        steps: [
          { name: "load_eligible", status: "completed", started_at: "2026-01-01T00:00:00Z", completed_at: "2026-01-01T00:01:00Z" },
          { name: "calculate_weights", status: "running", started_at: "2026-01-01T00:01:00Z" },
        ],
        current_step: "calculate_weights",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:01:00Z",
      },
    ])

    renderCard()

    await waitFor(() => {
      expect(screen.getByText("Ejecutando...")).toBeInTheDocument()
    })
  })

  it("shows Detener button when run is processing", async () => {
    mockGetWeightingRuns.mockResolvedValue([
      {
        run_id: "run-1",
        country: "chile",
        period: 202602,
        status: "running",
        steps: [],
        current_step: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ])

    renderCard()

    await waitFor(() => {
      expect(screen.getByText("Detener")).toBeInTheDocument()
    })
  })

  it("confirming Detener cancels the running run (JAA-411: cancel ported from e2e)", async () => {
    // Ported from the Playwright cancel test: under the fast mock a real run
    // completes before a UI click can land, so the cancel-from-running path is
    // exercised deterministically here with a pinned "running" run.
    const user = userEvent.setup()
    mockGetWeightingRuns.mockResolvedValue([
      {
        run_id: "run-1",
        country: "chile",
        period: 202602,
        status: "running",
        steps: [],
        current_step: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ])
    mockCancelWeighting.mockResolvedValue({ run_id: "run-1", status: "cancelled" })

    renderCard()

    // Open the stop confirmation dialog from the running-state "Detener" button.
    await user.click(await screen.findByText("Detener"))
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText("Detener ejecucion")).toBeInTheDocument()

    // Confirm → cancelWeighting is invoked with the running run id.
    await user.click(within(dialog).getByRole("button", { name: "Detener" }))
    await waitFor(() => {
      expect(mockCancelWeighting).toHaveBeenCalledWith("run-1")
    })
  })

  it("action row wraps so Detener does not clip off the card while processing", async () => {
    mockGetWeightingRuns.mockResolvedValue([
      {
        run_id: "run-1",
        country: "chile",
        period: 202602,
        status: "running",
        steps: [],
        current_step: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ])

    renderCard()

    const detener = await screen.findByText("Detener")
    // The action row is the flex container holding both the Procesando button
    // and the Detener button. It must wrap instead of clipping overflow.
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
      expect(screen.getByText("Error")).toBeInTheDocument()
      expect(screen.getByText("Pipeline failed at step: calculate_weights")).toBeInTheDocument()
    })
  })

  it("shows Re-ejecutar button when run has failed", async () => {
    mockGetWeightingRuns.mockResolvedValue([
      {
        run_id: "run-1",
        country: "chile",
        period: 202602,
        status: "failed",
        steps: [],
        current_step: null,
        error_message: "fail",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ])

    renderCard()

    await waitFor(() => {
      expect(screen.getByText("Re-ejecutar")).toBeInTheDocument()
    })
  })

  // JAA-423 — per-country config + iterate loop

  it("exposes a per-country 'Configurar parametros' control (no global gear) (ac1)", async () => {
    renderCard()
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Configurar parametros" })).toBeInTheDocument()
    })
  })

  it("seeds the config dialog from this country's last run parameters_json (ac2)", async () => {
    const user = userEvent.setup()
    mockGetWeightingRuns.mockResolvedValue([completedRun({ MAX_ROUNDS_COLAPSO: 99, METODO_BOUNDS: "iqr" })])

    renderCard()

    await user.click(await screen.findByRole("button", { name: "Configurar parametros" }))
    // The numeric field reflects the last run's stored value, not the default (50).
    const field = await screen.findByLabelText("Maximo juntas marginales")
    expect(field).toHaveValue(99)
  })

  it("falls back to defaults in the config dialog when the country has no runs (ac2)", async () => {
    const user = userEvent.setup()
    mockGetWeightingRuns.mockResolvedValue([])

    renderCard()

    await user.click(await screen.findByRole("button", { name: "Configurar parametros" }))
    const field = await screen.findByLabelText("Maximo juntas marginales")
    expect(field).toHaveValue(DEFAULT_PARAMS.MAX_ROUNDS_COLAPSO)
  })

  it("posts the per-country edited params when running (ac3)", async () => {
    const user = userEvent.setup()
    mockGetWeightingRuns.mockResolvedValue([])
    mockCreateWeightingRun.mockResolvedValue({ run_id: "r1", country: "chile", status: "pending" })
    mockExecuteWeighting.mockResolvedValue({ run_id: "r1", status: "running" })

    renderCard()

    await user.click(await screen.findByRole("button", { name: "Configurar parametros" }))
    const field = await screen.findByLabelText("Maximo juntas marginales")
    await user.clear(field)
    await user.type(field, "77")
    // Close the dialog (Escape) and run.
    await user.keyboard("{Escape}")
    await user.click(await screen.findByText("Ejecutar"))
    await user.click(await screen.findByText("Confirmar"))

    await waitFor(() => {
      expect(mockCreateWeightingRun).toHaveBeenCalledWith(
        expect.objectContaining({
          country: "chile",
          period: 202602,
          parameters: expect.objectContaining({ MAX_ROUNDS_COLAPSO: 77 }),
        }),
      )
    })
  })

  it("'Marcar como listo' closes the pesaje process for the country (ac5)", async () => {
    const user = userEvent.setup()
    mockGetWeightingRuns.mockResolvedValue([completedRun()])

    renderCard()

    await user.click(await screen.findByRole("button", { name: /Marcar como listo/ }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Marcar como listo" }))

    await waitFor(() => {
      expect(mockCloseProcess).toHaveBeenCalledWith("pesaje", "chile")
    })
  })

  it("hides config + run actions and 'Marcar como listo' once the process is closed (ac5)", async () => {
    mockGetWeightingRuns.mockResolvedValue([completedRun()])
    mockGetProcessStatus.mockResolvedValue({
      countries: { chile: { pesaje: { status: "closed", changed_by: "Ana", changed_at: "2026-01-02T00:00:00Z" } } },
    })

    renderCard()

    // Detail button proves the card rendered the completed run.
    await screen.findByText("Ver detalle")
    expect(screen.queryByRole("button", { name: "Configurar parametros" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Marcar como listo/ })).not.toBeInTheDocument()
    // The run button still renders but is disabled (proceso cerrado bloquea nuevas corridas).
    expect(screen.getByRole("button", { name: "Re-ejecutar" })).toBeDisabled()
  })
})

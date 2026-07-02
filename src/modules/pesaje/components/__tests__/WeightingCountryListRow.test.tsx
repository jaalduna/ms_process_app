import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Table, TableBody } from "@/components/ui/table"

vi.mock("@azure/msal-react", () => ({
  useIsAuthenticated: vi.fn(() => true),
  useMsal: vi.fn(() => ({
    instance: {},
    accounts: [{ username: "test@test.com", name: "Test User" }],
    inProgress: "none",
  })),
  MsalProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

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

import { WeightingCountryListRow } from "@/modules/pesaje/components/WeightingCountryListRow"

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

function renderRow(overrides?: { lastFinalizedDate?: string | null }) {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Table>
          <TableBody>
            <WeightingCountryListRow
              countryCode="chile"
              period="202602"
              lastFinalizedDate={overrides?.lastFinalizedDate ?? null}
            />
          </TableBody>
        </Table>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

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

function getRow() {
  return screen.getByRole("button", { name: /Abrir detalle de Pesaje/ })
}

describe("WeightingCountryListRow — parity with WeightingCountryCard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetWeightingRuns.mockResolvedValue([])
    mockGetWeightingRun.mockResolvedValue(null)
    mockGetProcessStatus.mockResolvedValue({ countries: {} })
    mockCloseProcess.mockResolvedValue({})
  })

  it("renders country name and 'never' badge", async () => {
    renderRow()
    await waitFor(() => expect(screen.getByText("Chile")).toBeInTheDocument())
    expect(screen.getByText("never")).toBeInTheDocument()
  })

  it("clicking the row opens the detail dialog", async () => {
    const user = userEvent.setup()
    renderRow()
    await waitFor(() => expect(getRow()).toBeInTheDocument())

    await user.click(getRow())
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText("Configurar Pesaje")).toBeInTheDocument()
  })

  it("clicking the History icon does NOT open the detail dialog (stopPropagation)", async () => {
    const user = userEvent.setup()
    mockGetWeightingRuns.mockResolvedValue([
      { ...runningRun(), status: "completed", completed_at: "2026-01-01T00:05:00Z" },
    ])
    renderRow()

    await user.click(await screen.findByRole("button", { name: "Historial" }))
    expect(await screen.findByText(/Historial de Pesaje/)).toBeInTheDocument()
    expect(screen.queryByText("Detalle Pesaje")).not.toBeInTheDocument()
  })

  it("shows an icon-only Stop button (no 'Detener'/'Procesando...' text) when run is processing and confirming cancels it", async () => {
    const user = userEvent.setup()
    mockGetWeightingRuns.mockResolvedValue([runningRun()])
    mockCancelWeighting.mockResolvedValue({ run_id: "run-1", status: "cancelled" })
    renderRow()

    const stopButton = await screen.findByRole("button", { name: "Detener pesaje" })
    expect(screen.queryByText("Detener")).not.toBeInTheDocument()
    expect(screen.queryByText("Procesando...")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Iniciar pesaje" })).not.toBeInTheDocument()

    await user.click(stopButton)
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText("Detener ejecucion")).toBeInTheDocument()

    await user.click(within(dialog).getByRole("button", { name: "Detener" }))
    await waitFor(() => expect(mockCancelWeighting).toHaveBeenCalledWith("run-1"))
  })

  // --- JAA-778: icon-only Play button launches directly, no modal -----

  it("shows an icon-only Play button in Acciones when there are no prior runs", async () => {
    renderRow()
    await waitFor(() => expect(getRow()).toBeInTheDocument())
    expect(screen.getByRole("button", { name: "Iniciar pesaje" })).toBeInTheDocument()
    expect(screen.queryByText("Ejecutar")).not.toBeInTheDocument()
  })

  it("still shows the icon-only Play button once a run has completed (re-run)", async () => {
    mockGetWeightingRuns.mockResolvedValue([
      { ...runningRun(), status: "completed", completed_at: "2026-01-01T00:05:00Z" },
    ])
    renderRow()
    expect(await screen.findByRole("button", { name: "Iniciar pesaje" })).toBeInTheDocument()
  })

  it("clicking Play launches the pipeline directly without opening the detail dialog", async () => {
    const user = userEvent.setup()
    mockCreateWeightingRun.mockResolvedValue({ run_id: "run-1" })
    mockExecuteWeighting.mockResolvedValue({ run_id: "run-1", status: "running" })
    renderRow()
    await waitFor(() => expect(getRow()).toBeInTheDocument())

    await user.click(screen.getByRole("button", { name: "Iniciar pesaje" }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Iniciar" }))

    await waitFor(() => expect(mockCreateWeightingRun).toHaveBeenCalled())
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.queryByText(/Historial de Pesaje/)).not.toBeInTheDocument()
  })

  it("does not show the Play button while a run is processing (Stop occupies that slot)", async () => {
    mockGetWeightingRuns.mockResolvedValue([runningRun()])
    renderRow()
    await screen.findByRole("button", { name: "Detener pesaje" })
    expect(screen.queryByRole("button", { name: "Iniciar pesaje" })).not.toBeInTheDocument()
  })
})

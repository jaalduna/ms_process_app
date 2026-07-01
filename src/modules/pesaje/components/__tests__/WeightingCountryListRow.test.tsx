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

  it("shows Detener button when run is processing and confirming cancels it", async () => {
    const user = userEvent.setup()
    mockGetWeightingRuns.mockResolvedValue([runningRun()])
    mockCancelWeighting.mockResolvedValue({ run_id: "run-1", status: "cancelled" })
    renderRow()

    await user.click(await screen.findByText("Detener"))
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText("Detener ejecucion")).toBeInTheDocument()

    await user.click(within(dialog).getByRole("button", { name: "Detener" }))
    await waitFor(() => expect(mockCancelWeighting).toHaveBeenCalledWith("run-1"))
  })

  // --- JAA-766: explicit Ejecutar/Re-ejecutar action button in Acciones -----

  it("shows an 'Ejecutar' button in Acciones when there are no prior runs (JAA-766)", async () => {
    renderRow()
    await waitFor(() => expect(getRow()).toBeInTheDocument())
    expect(screen.getByRole("button", { name: "Ejecutar" })).toBeInTheDocument()
  })

  it("shows a 'Re-ejecutar' button in Acciones once a run has completed (JAA-766)", async () => {
    mockGetWeightingRuns.mockResolvedValue([
      { ...runningRun(), status: "completed", completed_at: "2026-01-01T00:05:00Z" },
    ])
    renderRow()
    expect(await screen.findByRole("button", { name: "Re-ejecutar" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Ejecutar" })).not.toBeInTheDocument()
  })

  it("clicking Ejecutar opens the detail dialog without also opening history (JAA-766)", async () => {
    const user = userEvent.setup()
    renderRow()
    await waitFor(() => expect(getRow()).toBeInTheDocument())

    await user.click(screen.getByRole("button", { name: "Ejecutar" }))
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText("Configurar Pesaje")).toBeInTheDocument()
    expect(screen.queryByText(/Historial de Pesaje/)).not.toBeInTheDocument()
  })

  it("does not show Ejecutar/Re-ejecutar while a run is processing (Procesando/Detener already occupy that slot)", async () => {
    mockGetWeightingRuns.mockResolvedValue([runningRun()])
    renderRow()
    await screen.findByText("Detener")
    expect(screen.queryByRole("button", { name: "Ejecutar" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Re-ejecutar" })).not.toBeInTheDocument()
  })
})

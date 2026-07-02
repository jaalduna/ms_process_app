import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { CountryListRow } from "../CountryListRow"
import { Table, TableBody } from "@/components/ui/table"
import type { CountryInfo } from "@/types/api"
import type { CalibrationConfig } from "../../types"

const mockUseCalibration = vi.fn()
vi.mock("../../hooks/useCalibration", () => ({
  useCalibration: (...args: unknown[]) => mockUseCalibration(...args),
}))

vi.mock("@/hooks/useProcessStatus", () => ({
  useProcessStatus: () => ({ data: { countries: {} } }),
  useProcessEntry: () => ({ entry: null, isOpen: false, isClosed: false }),
  useSetProcessStatus: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock("../../hooks/useCalibrationConfig", () => ({
  useCountryGroupBy: () => ({ data: undefined }),
  useSaveCountryGroupBy: () => ({ mutateAsync: vi.fn(), isPending: false }),
  resolveGroupBy: () => "default-group",
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

const country: CountryInfo = { code: "chile", type: "country" } as CountryInfo
const calibrationConfig: CalibrationConfig = {
  aggregations: { region: false, nivel_2: false },
  lookback_months: 3,
} as CalibrationConfig

function baseCalibration(overrides: Record<string, unknown> = {}) {
  return {
    job: undefined,
    isPending: false,
    isCancelling: false,
    startCalibration: vi.fn().mockResolvedValue(undefined),
    cancelCalibration: vi.fn(),
    ...overrides,
  }
}

function renderRow() {
  const Wrapper = createWrapper()
  return render(
    <Wrapper>
      <Table>
        <TableBody>
          <CountryListRow
            country={country}
            period="202602"
            availability={{ elegibilidad: null, pesaje: null }}
            availabilityLoading={false}
            calibrationConfig={calibrationConfig}
            lastSyncDate={null}
            lastCalibrationDate={null}
          />
        </TableBody>
      </Table>
    </Wrapper>,
  )
}

describe("CountryListRow — parity with CountryCard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCalibration.mockReturnValue(baseCalibration())
  })

  it("renders country label and Sync/Cal badges", () => {
    renderRow()
    expect(screen.getByText("Chile")).toBeInTheDocument()
    expect(screen.getByText(/Sync: never/)).toBeInTheDocument()
    expect(screen.getByText(/Cal: never/)).toBeInTheDocument()
  })

  it("whole row click opens the history modal with the same aria-label as the card", async () => {
    const user = userEvent.setup()
    renderRow()
    await user.click(screen.getByRole("button", { name: /View calibration history for chile/i }))
    expect(await screen.findByText(/Historial de Calibracion/i)).toBeInTheDocument()
  })

  it("Calibrar button starts calibration and does not open the history modal", async () => {
    const user = userEvent.setup()
    const startCalibration = vi.fn().mockResolvedValue(undefined)
    mockUseCalibration.mockReturnValue(baseCalibration({ startCalibration }))
    renderRow()

    await user.click(screen.getByRole("button", { name: "Calibrar" }))
    await user.click(await screen.findByRole("button", { name: "Confirm" }))

    await waitFor(() => expect(startCalibration).toHaveBeenCalled())
    expect(screen.queryByText(/Historial de Calibracion/i)).not.toBeInTheDocument()
  })

  it("shows the Stop button while running, and the eye/detail button when a job exists", () => {
    mockUseCalibration.mockReturnValue(baseCalibration({ job: { status: "running" } }))
    renderRow()
    expect(screen.getByRole("button", { name: "Stop calibration" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Calibrar" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "View calibration details" })).toBeInTheDocument()
  })
})

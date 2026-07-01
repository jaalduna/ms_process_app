import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { CountryCard } from "../CountryCard"
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

const mockToastSuccess = vi.fn()
vi.mock("sonner", () => ({
  toast: { success: (...a: unknown[]) => mockToastSuccess(...a), error: vi.fn(), info: vi.fn() },
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

function renderCard(overrides: { availability?: { elegibilidad: boolean | null; pesaje: boolean | null } } = {}) {
  const Wrapper = createWrapper()
  return render(
    <Wrapper>
      <CountryCard
        country={country}
        period="202602"
        availability={overrides.availability ?? { elegibilidad: null, pesaje: null }}
        availabilityLoading={false}
        calibrationConfig={calibrationConfig}
        lastSyncDate={null}
        lastCalibrationDate={null}
      />
    </Wrapper>,
  )
}

describe("CountryCard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCalibration.mockReturnValue(baseCalibration())
  })

  it("renders country label and Sync/Cal badges", () => {
    renderCard()
    expect(screen.getByText("Chile")).toBeInTheDocument()
    expect(screen.getByText(/Sync: never/)).toBeInTheDocument()
    expect(screen.getByText(/Cal: never/)).toBeInTheDocument()
  })

  it("the dedicated Historial button opens the history modal (JAA-762)", async () => {
    const user = userEvent.setup()
    renderCard()
    await user.click(screen.getByTitle("Historial"))
    expect(await screen.findByText(/Historial de Calibracion/i)).toBeInTheDocument()
  })

  it("whole card click opens the detail modal (JAA-762)", async () => {
    const user = userEvent.setup()
    mockUseCalibration.mockReturnValue(baseCalibration({ job: { status: "running" } }))
    renderCard()
    await user.click(screen.getByRole("button", { name: /View calibration details for chile/i }))
    expect(await screen.findByText(/Calibration Detail/i)).toBeInTheDocument()
  })

  it("Calibrar button starts calibration and does not open the history modal", async () => {
    const user = userEvent.setup()
    const startCalibration = vi.fn().mockResolvedValue(undefined)
    mockUseCalibration.mockReturnValue(baseCalibration({ startCalibration }))
    renderCard()

    await user.click(screen.getByRole("button", { name: "Calibrar" }))
    await user.click(await screen.findByRole("button", { name: "Confirm" }))

    await waitFor(() => expect(startCalibration).toHaveBeenCalled())
    expect(screen.queryByText(/Historial de Calibracion/i)).not.toBeInTheDocument()
  })

  it("shows the Stop button while running, and the card itself is the detail trigger when a job exists", () => {
    mockUseCalibration.mockReturnValue(
      baseCalibration({ job: { status: "running" } }),
    )
    renderCard()
    expect(screen.getByRole("button", { name: "Stop calibration" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /View calibration details for chile/i })).toBeInTheDocument()
  })
})

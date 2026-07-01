import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { EventDetail, CountryInfo } from "@/types/api"
import type { DataAvailability, CalibrationConfig } from "@/modules/calibracion/types"

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
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}))

// Mock API
const mockGetCalibrationRuns = vi.fn()
const mockGetEvent = vi.fn()
const mockGetEvents = vi.fn()
const mockTriggerCalibration = vi.fn()
const mockCancelJob = vi.fn()
const mockDownloadCalibrationReport = vi.fn()
const mockGetProcessConfig = vi.fn()
const mockPutProcessConfig = vi.fn()
const mockGetProcessStatus = vi.fn()
const mockOpenProcess = vi.fn()
const mockCloseProcess = vi.fn()

vi.mock("@/lib/api", () => ({
  getCalibrationRuns: (...args: unknown[]) => mockGetCalibrationRuns(...args),
  getEvent: (...args: unknown[]) => mockGetEvent(...args),
  getEvents: (...args: unknown[]) => mockGetEvents(...args),
  triggerCalibration: (...args: unknown[]) => mockTriggerCalibration(...args),
  cancelJob: (...args: unknown[]) => mockCancelJob(...args),
  downloadCalibrationReport: (...args: unknown[]) => mockDownloadCalibrationReport(...args),
  getProcessConfig: (...args: unknown[]) => mockGetProcessConfig(...args),
  putProcessConfig: (...args: unknown[]) => mockPutProcessConfig(...args),
  getProcessStatus: (...args: unknown[]) => mockGetProcessStatus(...args),
  openProcess: (...args: unknown[]) => mockOpenProcess(...args),
  closeProcess: (...args: unknown[]) => mockCloseProcess(...args),
  setTokenProvider: vi.fn(),
  api: { interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } },
}))

import { CountryCard } from "@/modules/calibracion/components/CountryCard"

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

const country: CountryInfo = { code: "chile", queries: [], queries_count: 0, type: "country" }

const availability: DataAvailability = { elegibilidad: true, pesaje: true }

const calibrationConfig: CalibrationConfig = {
  aggregations: { region: true, nivel_2: true },
  lookback_months: 36,
}

const activeJob = (overrides: Partial<EventDetail> = {}): EventDetail => ({
  job_id: "job-active-1",
  status: "running",
  country: "chile",
  stage: "calibracion",
  tag: "chile-calibracion-1",
  period: "202602",
  queries_total: 4,
  queries_completed: 2,
  queries_failed: 0,
  created_at: "2026-02-01T00:00:00Z",
  started_at: "2026-02-01T00:00:01Z",
  completed_at: null,
  triggered_by: "calibration-app",
  error: null,
  current_query: null,
  failed_queries: [],
  running_queries: [],
  queries_running: 0,
  total_rows_extracted: 0,
  steps: [],
  current_step: "merge_data",
  results: [],
  ...overrides,
})

function renderCard() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CountryCard
          country={country}
          period="202602"
          availability={availability}
          availabilityLoading={false}
          calibrationConfig={calibrationConfig}
          lastSyncDate={null}
          lastCalibrationDate={null}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("CountryCard (JAA-762 card click -> detail, dedicated Historial button)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCalibrationRuns.mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 })
    mockGetEvent.mockResolvedValue(undefined)
    mockGetEvents.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 })
    mockGetProcessConfig.mockResolvedValue({ config: {}, editable: false })
    mockGetProcessStatus.mockResolvedValue({ countries: {} })
  })

  // ac1: a dedicated ghost "Historial" button is always visible and opens
  // CalibrationHistoryModal (not CalibrationDetailModal).
  it("ac1: Historial button is always visible and opens the history modal, not the detail modal", async () => {
    const user = userEvent.setup()
    renderCard()

    const historialButton = await screen.findByRole("button", { name: "Historial" })
    expect(historialButton).toBeInTheDocument()

    await user.click(historialButton)
    expect(await screen.findByText(/Historial de Calibracion/)).toBeInTheDocument()
    expect(screen.queryByText("Calibration Detail")).not.toBeInTheDocument()
  })

  // ac2: when a job exists, clicking the card root opens CalibrationDetailModal.
  it("ac2: clicking the card root opens CalibrationDetailModal when a job exists", async () => {
    const user = userEvent.setup()
    mockGetCalibrationRuns.mockResolvedValue({
      items: [{ ...activeJob(), job_id: "job-active-1" }],
      total: 1,
      limit: 50,
      offset: 0,
    })
    mockGetEvent.mockResolvedValue(activeJob())

    renderCard()

    const cardRoot = await screen.findByRole("button", { name: /View calibration details for/i })
    await user.click(cardRoot)

    expect(await screen.findByText("Calibration Detail")).toBeInTheDocument()
  })

  // ac3: when no job exists, clicking the card root is a no-op (no dialog opens).
  it("ac3: clicking the card root when no job exists does not open any dialog", async () => {
    const user = userEvent.setup()
    renderCard()

    const cardRoot = await screen.findByRole("button", { name: /View calibration details for/i })
    await user.click(cardRoot)

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
  })

  // ac4: clicking "Calibrar" and "Historial" preserve stopPropagation and never
  // open CalibrationDetailModal.
  it("ac4: clicking Calibrar or Historial does not open CalibrationDetailModal (stopPropagation)", async () => {
    const user = userEvent.setup()
    mockGetCalibrationRuns.mockResolvedValue({
      items: [{ ...activeJob(), job_id: "job-active-1" }],
      total: 1,
      limit: 50,
      offset: 0,
    })
    mockGetEvent.mockResolvedValue(activeJob())

    renderCard()

    await user.click(await screen.findByRole("button", { name: "Calibrar" }))
    expect(screen.queryByText("Calibration Detail")).not.toBeInTheDocument()

    await user.click(await screen.findByRole("button", { name: "Historial" }))
    expect(await screen.findByText(/Historial de Calibracion/)).toBeInTheDocument()
    expect(screen.queryByText("Calibration Detail")).not.toBeInTheDocument()
  })

  // ac5: the old standalone Eye "View calibration details" button is gone —
  // only the card root itself carries that accessible name.
  it("ac5: only the card root (not a separate Eye button) carries the 'View calibration details' accessible name", async () => {
    renderCard()

    const matches = await screen.findAllByRole("button", { name: /View calibration details/i })
    expect(matches).toHaveLength(1)
    expect(matches[0]).toHaveAttribute("aria-label", expect.stringMatching(/^View calibration details for/))
  })
})

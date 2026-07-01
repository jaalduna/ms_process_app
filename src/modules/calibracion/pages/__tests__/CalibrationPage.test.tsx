import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

// Map-backed localStorage stub (the test env does not provide one natively).
function installLocalStorageStub() {
  const store = new Map<string, string>()
  const mock: Storage = {
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size
    },
  }
  vi.stubGlobal("localStorage", mock)
}
installLocalStorageStub()

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const mockGetCountries = vi.fn()

vi.mock("@/lib/api", () => ({
  getCountries: (...args: unknown[]) => mockGetCountries(...args),
  getLastSync: vi.fn().mockResolvedValue({}),
  getLastCalibration: vi.fn().mockResolvedValue({}),
  getProcessConfig: vi.fn().mockResolvedValue({ config: {}, editable: false }),
  putProcessConfig: vi.fn(),
  getCalibrationRuns: vi.fn().mockResolvedValue({ items: [] }),
  getEvent: vi.fn(),
  triggerCalibration: vi.fn(),
  cancelJob: vi.fn(),
  getProcessStatus: vi.fn().mockResolvedValue({ countries: {} }),
  openProcess: vi.fn(),
  closeProcess: vi.fn(),
}))

const MOCK_COUNTRIES = {
  countries: [
    { code: "chile", queries: [], queries_count: 0, type: "country" },
    { code: "mexico", queries: [], queries_count: 0, type: "country" },
  ],
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe("CalibrationPage — Tarjetas/Lista toggle (JAA-763)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockGetCountries.mockResolvedValue(MOCK_COUNTRIES)
  })

  it("defaults to card grid and shows a Tarjetas/Lista toggle", async () => {
    const { CalibrationPage } = await import("../CalibrationPage")
    const Wrapper = createWrapper()
    render(<CalibrationPage />, { wrapper: Wrapper })

    await waitFor(() => expect(screen.getByText("Chile")).toBeInTheDocument())
    expect(screen.getByRole("button", { name: "View calibration details for Chile" })).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Cambiar vista" })).toBeInTheDocument()
  })

  it("switching to Lista renders a table with the same country data, and back without reload", async () => {
    const user = userEvent.setup()
    const { CalibrationPage } = await import("../CalibrationPage")
    const Wrapper = createWrapper()
    render(<CalibrationPage />, { wrapper: Wrapper })

    await waitFor(() => expect(screen.getByText("Chile")).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: "Lista" }))

    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument())
    // List view renders CountryListRow (untouched by JAA-762), still "history".
    expect(screen.getByRole("button", { name: "View calibration history for Chile" })).toBeInTheDocument()
    expect(screen.getByText("Mexico")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Tarjetas" }))
    await waitFor(() => expect(screen.queryByRole("table")).not.toBeInTheDocument())
    expect(screen.getByText("Chile")).toBeInTheDocument()
  })

  it("persists the Lista preference across a remount (localStorage, JAA-763 ac4)", async () => {
    const user = userEvent.setup()
    const { CalibrationPage } = await import("../CalibrationPage")
    const Wrapper = createWrapper()
    const { unmount } = render(<CalibrationPage />, { wrapper: Wrapper })

    await waitFor(() => expect(screen.getByText("Chile")).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: "Lista" }))
    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument())
    unmount()

    render(<CalibrationPage />, { wrapper: createWrapper() })
    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument())
  })
})

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ProcessStatusBadge } from "@/components/ProcessStatusBadge"

const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
    info: vi.fn(),
  }),
}))

const mockGetProcessStatus = vi.fn()
const mockOpenProcess = vi.fn()
const mockCloseProcess = vi.fn()

vi.mock("@/lib/api", () => ({
  getProcessStatus: (...args: unknown[]) => mockGetProcessStatus(...args),
  openProcess: (...args: unknown[]) => mockOpenProcess(...args),
  closeProcess: (...args: unknown[]) => mockCloseProcess(...args),
  setTokenProvider: vi.fn(),
  api: { interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } },
}))

const OPEN_ENTRY = {
  country: "argentina",
  stage: "pesaje",
  status: "open",
  changed_by: "Maria Gonzalez",
  changed_by_email: "maria.gonzalez@kantar.com",
  changed_at: "2026-06-10T14:30:00.000Z",
  history: [],
}

function renderBadge(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("ProcessStatusBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows open state with attribution", async () => {
    mockGetProcessStatus.mockResolvedValue({ countries: { argentina: { pesaje: OPEN_ENTRY } } })

    renderBadge(
      <ProcessStatusBadge stage="pesaje" country="argentina" countryLabel="Argentina" />,
    )

    await waitFor(() => {
      expect(screen.getByText("Abierto")).toBeInTheDocument()
    })
    expect(screen.getByText(/por Maria Gonzalez/)).toBeInTheDocument()
  })

  it("opens a closed process after confirmation and shows a toast", async () => {
    mockGetProcessStatus.mockResolvedValue({ countries: {} })
    mockOpenProcess.mockResolvedValue({ ...OPEN_ENTRY, country: "chile" })
    const user = userEvent.setup()

    renderBadge(<ProcessStatusBadge stage="pesaje" country="chile" countryLabel="Chile" />)

    await user.click(await screen.findByText("Cerrado"))
    await user.click(await screen.findByRole("button", { name: "Abrir proceso" }))

    await waitFor(() => {
      expect(mockOpenProcess).toHaveBeenCalledWith("pesaje", "chile")
    })
    expect(mockToastSuccess).toHaveBeenCalledWith("Proceso de Pesaje abierto para Chile")
  })

  it("closes an open process after confirmation", async () => {
    mockGetProcessStatus.mockResolvedValue({ countries: { argentina: { pesaje: OPEN_ENTRY } } })
    mockCloseProcess.mockResolvedValue({ ...OPEN_ENTRY, status: "closed" })
    const user = userEvent.setup()

    renderBadge(
      <ProcessStatusBadge stage="pesaje" country="argentina" countryLabel="Argentina" />,
    )

    await user.click(await screen.findByText("Abierto"))
    await user.click(await screen.findByRole("button", { name: "Cerrar proceso" }))

    await waitFor(() => {
      expect(mockCloseProcess).toHaveBeenCalledWith("pesaje", "argentina")
    })
    expect(mockToastSuccess).toHaveBeenCalledWith("Proceso de Pesaje cerrado para Argentina")
  })

  it("shows an error toast when the state change fails", async () => {
    mockGetProcessStatus.mockResolvedValue({ countries: { argentina: { pesaje: OPEN_ENTRY } } })
    mockCloseProcess.mockRejectedValue({
      error: "conflict",
      message: "El proceso de pesaje de argentina ya estaba cerrado",
    })
    const user = userEvent.setup()

    renderBadge(
      <ProcessStatusBadge stage="pesaje" country="argentina" countryLabel="Argentina" />,
    )

    await user.click(await screen.findByText("Abierto"))
    await user.click(await screen.findByRole("button", { name: "Cerrar proceso" }))

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "El proceso de pesaje de argentina ya estaba cerrado",
      )
    })
  })
})

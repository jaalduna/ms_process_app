import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

// Mock sonner toast
const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: (...a: unknown[]) => mockToastSuccess(...a),
    error: (...a: unknown[]) => mockToastError(...a),
    info: vi.fn(),
  }),
}))

const mockGetFormato4Runs = vi.fn()
const mockDownloadFormato4 = vi.fn()
vi.mock("@/lib/api", () => ({
  getFormato4Runs: (...a: unknown[]) => mockGetFormato4Runs(...a),
  downloadFormato4: (...a: unknown[]) => mockDownloadFormato4(...a),
}))

import { Formato4HistoryModal } from "../Formato4HistoryModal"

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

function renderModal(open = true) {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <Formato4HistoryModal
        country="chile"
        countryLabel="Chile"
        countryFlag="🇨🇱"
        open={open}
        onClose={() => {}}
      />
    </QueryClientProvider>,
  )
}

const run = (status: string, extra: Record<string, unknown> = {}) => ({
  run_id: "run-1",
  country: "chile",
  period: 202602,
  status,
  steps: [],
  created_at: "2026-01-15T10:30:00Z",
  updated_at: "2026-01-15T10:35:00Z",
  ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockGetFormato4Runs.mockResolvedValue({ items: [], total: 0 })
  mockDownloadFormato4.mockResolvedValue(undefined)
})

describe("Formato4HistoryModal", () => {
  it("does not query when closed", () => {
    renderModal(false)
    expect(mockGetFormato4Runs).not.toHaveBeenCalled()
  })

  it("queries prior runs for the country when open", async () => {
    renderModal()
    await waitFor(() =>
      expect(mockGetFormato4Runs).toHaveBeenCalledWith(
        expect.objectContaining({ country: "chile" }),
      ),
    )
  })

  it("renders the empty state when there are no runs", async () => {
    mockGetFormato4Runs.mockResolvedValue({ items: [], total: 0 })
    renderModal()
    await waitFor(() =>
      expect(screen.getByText(/No Formato 4 runs found/i)).toBeInTheDocument(),
    )
  })

  it("renders the error state when the query fails", async () => {
    mockGetFormato4Runs.mockRejectedValue(new Error("boom"))
    renderModal()
    await waitFor(() =>
      expect(screen.getByText(/Failed to load Formato 4 history/i)).toBeInTheDocument(),
    )
  })

  it("lists prior runs with status badge and timestamp", async () => {
    mockGetFormato4Runs.mockResolvedValue({
      items: [run("completed"), run("failed", { run_id: "run-2" })],
      total: 2,
    })
    renderModal()
    await waitFor(() => expect(screen.getByText("Completado")).toBeInTheDocument())
    expect(screen.getByText("Error")).toBeInTheDocument()
    // timestamp formatted (Jan ... 2026) appears for each entry
    expect(screen.getAllByText(/Jan 15, 2026/).length).toBeGreaterThanOrEqual(2)
    // period rendered
    expect(screen.getAllByText("202602").length).toBeGreaterThanOrEqual(2)
  })

  it("re-download on a completed run calls downloadFormato4(run_id, country) + success toast", async () => {
    const user = userEvent.setup()
    mockGetFormato4Runs.mockResolvedValue({ items: [run("completed")], total: 1 })
    renderModal()
    const btn = await screen.findByRole("button", { name: /Download Formato 4 zip/i })
    await user.click(btn)
    await waitFor(() => expect(mockDownloadFormato4).toHaveBeenCalledWith("run-1", "chile"))
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled())
  })

  it("download failure surfaces an error toast", async () => {
    const user = userEvent.setup()
    mockGetFormato4Runs.mockResolvedValue({ items: [run("completed")], total: 1 })
    mockDownloadFormato4.mockRejectedValue(new Error("nope"))
    renderModal()
    await user.click(await screen.findByRole("button", { name: /Download Formato 4 zip/i }))
    await waitFor(() => expect(mockToastError).toHaveBeenCalled())
  })

  it("the download action is disabled for a non-completed run", async () => {
    mockGetFormato4Runs.mockResolvedValue({ items: [run("running")], total: 1 })
    renderModal()
    const btn = await screen.findByRole("button", { name: /Download Formato 4 zip/i })
    expect(btn).toBeDisabled()
  })

  it("shows the results row_count for a completed run with a summary", async () => {
    mockGetFormato4Runs.mockResolvedValue({
      items: [
        run("completed", {
          results_summary: { country: "chile", period: 202602, row_count: 12345 },
        }),
      ],
      total: 1,
    })
    renderModal()
    await waitFor(() => expect(screen.getByText(/12,345 rows/)).toBeInTheDocument())
  })
})

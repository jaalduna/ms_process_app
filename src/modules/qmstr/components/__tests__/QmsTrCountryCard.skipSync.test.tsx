import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

const mockGetQmsTrRuns = vi.fn()
const mockGetQmsTrRun = vi.fn()
const mockCreateQmsTrRun = vi.fn()
const mockExecuteQmsTrRun = vi.fn()
const mockDownloadQmsTrTag = vi.fn()

vi.mock("@/lib/api", () => ({
  getQmsTrRuns: (...a: unknown[]) => mockGetQmsTrRuns(...a),
  getQmsTrRun: (...a: unknown[]) => mockGetQmsTrRun(...a),
  createQmsTrRun: (...a: unknown[]) => mockCreateQmsTrRun(...a),
  executeQmsTrRun: (...a: unknown[]) => mockExecuteQmsTrRun(...a),
  downloadQmsTrTag: (...a: unknown[]) => mockDownloadQmsTrTag(...a),
}))

import { QmsTrCountryCard } from "../QmsTrCountryCard"

function renderCard(countryCode = "brasil") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <QmsTrCountryCard countryCode={countryCode} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetQmsTrRuns.mockResolvedValue({ items: [], total: 0 })
  mockGetQmsTrRun.mockResolvedValue(null)
  mockCreateQmsTrRun.mockResolvedValue({
    job_id: "job-1", country: "brasil", ano_base: 2025, status: "pending",
    steps: [], created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  })
  mockExecuteQmsTrRun.mockResolvedValue({})
})

describe("QmsTrCountryCard — skip_sync toggle (JAA-1003, ac1/ac2)", () => {
  it("ac1: the confirm dialog shows a 'Saltar sincronización' Switch, checked by default", async () => {
    const user = userEvent.setup()
    renderCard()
    await user.click(await screen.findByRole("button", { name: "Ejecutar" }))

    const dialog = await screen.findByRole("alertdialog")
    const toggle = within(dialog).getByRole("switch", { name: /saltar sincronización/i })
    expect(toggle).toBeChecked()
  })

  it("ac2: confirming without toggling sends skip_sync: true", async () => {
    const user = userEvent.setup()
    renderCard()
    await user.click(await screen.findByRole("button", { name: "Ejecutar" }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Confirmar" }))

    await waitFor(() => expect(mockCreateQmsTrRun).toHaveBeenCalledTimes(1))
    expect(mockCreateQmsTrRun.mock.calls[0][0]).toMatchObject({ skip_sync: true })
  })

  it("ac2: switching the toggle off sends skip_sync: false", async () => {
    const user = userEvent.setup()
    renderCard()
    await user.click(await screen.findByRole("button", { name: "Ejecutar" }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("switch", { name: /saltar sincronización/i }))
    await user.click(within(dialog).getByRole("button", { name: "Confirmar" }))

    await waitFor(() => expect(mockCreateQmsTrRun).toHaveBeenCalledTimes(1))
    expect(mockCreateQmsTrRun.mock.calls[0][0]).toMatchObject({ skip_sync: false })
  })
})

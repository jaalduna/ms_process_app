import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: (...a: unknown[]) => mockToastSuccess(...a),
    error: (...a: unknown[]) => mockToastError(...a),
  }),
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

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

function renderCard(countryCode = "brasil") {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <QmsTrCountryCard countryCode={countryCode} />
    </QueryClientProvider>,
  )
}

const baseRun = (status: string, extra: Record<string, unknown> = {}) => ({
  job_id: "job-1",
  country: "brasil",
  ano_base: 2025,
  status,
  steps: [
    { name: "silver_builder", status: "pending" },
    { name: "kpis_batch", status: "pending" },
    { name: "export_zip", status: "pending" },
  ],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockGetQmsTrRuns.mockResolvedValue({ items: [], total: 0 })
  mockGetQmsTrRun.mockResolvedValue(null)
})

describe("QmsTrCountryCard", () => {
  it("renders the country name and an editable ano_base input defaulted to last year", async () => {
    renderCard()
    await waitFor(() => expect(screen.getByText("Brasil")).toBeInTheDocument())
    const input = screen.getByLabelText("Año base") as HTMLInputElement
    expect(Number(input.value)).toBe(new Date().getFullYear() - 1)
  })

  it("idle: shows an enabled Ejecutar button and no Eye/Download/Retry", async () => {
    renderCard()
    await waitFor(() => expect(screen.getByRole("button", { name: "Ejecutar" })).toBeEnabled())
    expect(screen.queryByRole("button", { name: /Ver detalle|Ver logs/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Descargar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Reintentar/ })).not.toBeInTheDocument()
  })

  it("Ejecutar -> confirm -> creates a run with {country, ano_base} (no parameters field), then executes it", async () => {
    const user = userEvent.setup()
    mockCreateQmsTrRun.mockResolvedValue(baseRun("pending"))
    mockExecuteQmsTrRun.mockResolvedValue(baseRun("running"))

    renderCard()
    await user.click(await screen.findByRole("button", { name: "Ejecutar" }))

    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText("Confirmar QMS-TR")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Confirmar" }))

    await waitFor(() =>
      expect(mockCreateQmsTrRun).toHaveBeenCalledWith({
        country: "brasil",
        ano_base: new Date().getFullYear() - 1,
      }),
    )
    const arg = mockCreateQmsTrRun.mock.calls[0][0]
    expect(arg).not.toHaveProperty("parameters")
    // The decisive fix (JAA-998): create alone must NOT be enough -- execute
    // has to be chained on create's success, using the created run's job_id.
    await waitFor(() => expect(mockExecuteQmsTrRun).toHaveBeenCalledWith("job-1"))
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled())
  })

  it("running: shows the API-driven step names (not the old MTR DAG labels), no hardcoded copy_bridge/tag_run/run_stage/publish_gold", async () => {
    mockGetQmsTrRuns.mockResolvedValue({
      items: [
        baseRun("running", {
          steps: [
            { name: "silver_builder", status: "completed" },
            { name: "kpis_batch", status: "running" },
            { name: "export_zip", status: "pending" },
          ],
        }),
      ],
      total: 1,
    })
    renderCard()
    await waitFor(() => expect(screen.getAllByText("Ejecutando...").length).toBeGreaterThan(0))
    expect(screen.getByText("Kpis Batch")).toBeInTheDocument()
    expect(screen.queryByText(/copy_bridge|tag_run|run_stage|publish_gold/i)).not.toBeInTheDocument()
  })

  it("completed: renders a Descargar button that downloads by tag + success toast", async () => {
    const user = userEvent.setup()
    mockGetQmsTrRuns.mockResolvedValue({ items: [baseRun("completed", { tag: "tag-1" })], total: 1 })
    mockDownloadQmsTrTag.mockResolvedValue(undefined)

    renderCard()
    const downloadBtn = await screen.findByRole("button", { name: /Descargar/ })
    await user.click(downloadBtn)

    await waitFor(() => expect(mockDownloadQmsTrTag).toHaveBeenCalledWith("tag-1", "brasil"))
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled())
  })

  it("does NOT render Descargar when the run is not completed", async () => {
    mockGetQmsTrRuns.mockResolvedValue({ items: [baseRun("running")], total: 1 })
    renderCard()
    await waitFor(() => expect(screen.getAllByText("Ejecutando...").length).toBeGreaterThan(0))
    expect(screen.queryByRole("button", { name: /Descargar/ })).not.toBeInTheDocument()
  })

  it("failed: shows the error message, a Reintentar button, and an Eye 'ver logs' button", async () => {
    const user = userEvent.setup()
    mockGetQmsTrRuns.mockResolvedValue({
      items: [baseRun("failed", { error_message: "Pipeline failed at step: kpis_batch" })],
      total: 1,
    })
    mockCreateQmsTrRun.mockResolvedValue(baseRun("pending"))

    renderCard()
    await waitFor(() => expect(screen.getByText("Error")).toBeInTheDocument())
    expect(screen.getByText("Pipeline failed at step: kpis_batch")).toBeInTheDocument()

    const retryBtn = screen.getByRole("button", { name: /Reintentar/ })
    await user.click(retryBtn)
    await waitFor(() =>
      expect(mockCreateQmsTrRun).toHaveBeenCalledWith({ country: "brasil", ano_base: 2025 }),
    )

    expect(screen.getByRole("button", { name: /Ver logs completos/ })).toBeInTheDocument()
  })

  it("clicking the card (outside the input/actions) opens the history modal", async () => {
    const user = userEvent.setup()
    renderCard()
    await user.click(await screen.findByRole("button", { name: /Ver historial/ }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText(/QMS-TR History/)).toBeInTheDocument()
  })
})

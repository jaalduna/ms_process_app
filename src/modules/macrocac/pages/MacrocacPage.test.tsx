import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MacrocacApiError } from "../types"

// Mock the macrocac API module — the wiring under test.
const mockUpload = vi.fn()
const mockCreateRun = vi.fn()

vi.mock("../api", () => ({
  uploadMacrocacFile: (...a: unknown[]) => mockUpload(...a),
  createMacrocacRun: (...a: unknown[]) => mockCreateRun(...a),
}))

const UPLOAD_RESP = {
  upload_id: "upl_macrocac_1",
  filename: "correcciones_bo.xlsx",
  pais: "BO",
  tabla: "j_atoscompra_new",
  motivo: "Corrección de campos de compra mal capturados en el operativo de campo.",
  filas: 14,
  columnas: ["IdAto", "Flg", "NewQuantidade"],
}

const RUN_RESP = {
  run_id: "run_macrocac_abc123",
  status: "running",
  dry_run: true,
  pais: "BO",
  tabla: "j_atoscompra_new",
  upload_id: "upl_macrocac_1",
  created_at: "2026-07-28T12:00:00.000Z",
  completed_at: null,
  resultado_lote: null,
}

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

async function renderPage() {
  const { MacrocacPage } = await import("./MacrocacPage")
  return render(
    <QueryClientProvider client={createClient()}>
      <MacrocacPage />
    </QueryClientProvider>,
  )
}

function makeFile(name = "correcciones_bo.xlsx") {
  return new File(["contenido"], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

describe("MacrocacPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("ac1: renders the form (tabla/pais selects, motivo, file input) instead of the placeholder", async () => {
    await renderPage()

    expect(screen.queryByText("Próximamente")).not.toBeInTheDocument()
    expect(screen.getByTestId("macrocac-tabla-select")).toBeInTheDocument()
    expect(screen.getByTestId("macrocac-pais-select")).toBeInTheDocument()
    expect(screen.getByTestId("macrocac-motivo-input")).toBeInTheDocument()
    expect(screen.getByTestId("macrocac-file-input")).toBeInTheDocument()
    expect(screen.getByTestId("macrocac-ejecutar")).toBeDisabled()
  })

  it("ac2: uploading a file (201) shows a chip with filename/filas/columnas", async () => {
    mockUpload.mockResolvedValue(UPLOAD_RESP)
    const user = userEvent.setup()
    await renderPage()

    const input = screen.getByTestId("macrocac-file-input") as HTMLInputElement
    await user.upload(input, makeFile())

    const chip = await screen.findByTestId("macrocac-upload-chip")
    expect(chip).toHaveTextContent("correcciones_bo.xlsx")
    expect(chip).toHaveTextContent("14 filas")
    expect(chip).toHaveTextContent("3 columnas")
    expect(screen.getByTestId("macrocac-ejecutar")).toBeEnabled()
  })

  it("ac2: 422 missing_columns renders the missing columns", async () => {
    mockUpload.mockRejectedValue(
      new MacrocacApiError(422, { error: "missing_columns", missing_columns: ["IdAto", "Flg"] }),
    )
    const user = userEvent.setup()
    await renderPage()

    const input = screen.getByTestId("macrocac-file-input") as HTMLInputElement
    await user.upload(input, makeFile("sin-idato.xlsx"))

    const detail = await screen.findByTestId("macrocac-missing-columns")
    expect(detail).toHaveTextContent("IdAto")
    expect(detail).toHaveTextContent("Flg")
    expect(screen.getByTestId("macrocac-ejecutar")).toBeDisabled()
  })

  it("ac2: 400 bad_request shows the backend error message", async () => {
    mockUpload.mockRejectedValue(
      new MacrocacApiError(400, { error: "bad_request", message: "País desconocido: 'XX'." }),
    )
    const user = userEvent.setup()
    await renderPage()

    const input = screen.getByTestId("macrocac-file-input") as HTMLInputElement
    await user.upload(input, makeFile())

    const detail = await screen.findByTestId("macrocac-upload-error")
    expect(detail).toHaveTextContent("País desconocido: 'XX'.")
  })

  it("ac3: Ejecutar on a valid upload (201) shows the run in 'running'", async () => {
    mockUpload.mockResolvedValue(UPLOAD_RESP)
    mockCreateRun.mockResolvedValue(RUN_RESP)
    const user = userEvent.setup()
    await renderPage()

    await user.upload(screen.getByTestId("macrocac-file-input") as HTMLInputElement, makeFile())
    await screen.findByTestId("macrocac-upload-chip")

    await user.click(screen.getByTestId("macrocac-ejecutar"))

    await waitFor(() => expect(mockCreateRun.mock.calls[0]?.[0]).toBe("upl_macrocac_1"))
    const status = await screen.findByTestId("macrocac-run-status")
    expect(status).toHaveTextContent("run_macrocac_abc123")
    expect(status).toHaveTextContent("running")
  })

  it("ac3: 409 run_in_progress shows the existing run_id", async () => {
    mockUpload.mockResolvedValue(UPLOAD_RESP)
    mockCreateRun.mockRejectedValue(
      new MacrocacApiError(409, {
        error: "run_in_progress",
        message: "Ya hay un run activo para BO/j_atoscompra_new.",
        run_id: "run_macrocac_existing",
      }),
    )
    const user = userEvent.setup()
    await renderPage()

    await user.upload(screen.getByTestId("macrocac-file-input") as HTMLInputElement, makeFile())
    await screen.findByTestId("macrocac-upload-chip")
    await user.click(screen.getByTestId("macrocac-ejecutar"))

    const conflict = await screen.findByTestId("macrocac-run-conflict")
    expect(conflict).toHaveTextContent("run_macrocac_existing")
    expect(screen.queryByTestId("macrocac-run-status")).not.toBeInTheDocument()
  })
})

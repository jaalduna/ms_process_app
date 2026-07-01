import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { toast } from "sonner"

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

// Mock the weighting-params API module — the upload/publish wiring under test.
const mockUpload = vi.fn()
const mockPublish = vi.fn()

vi.mock("@/modules/pesaje/params/api", () => ({
  uploadUniverso: (...a: unknown[]) => mockUpload(...a),
  publishUniverso: (...a: unknown[]) => mockPublish(...a),
}))

const VALID_RESP = {
  valid: true,
  errors: [],
  preview: { added: 1, removed: 0, changed: 1 },
  upload_token: "utok_chile_1",
}

const INVALID_RESP = {
  valid: false,
  errors: [
    { row: 3, field: "Q2-26", message: "Se esperaba un entero ≥ 0; se encontró texto." },
    { row: null, field: "Q1-26", message: "Falta la columna 'Q1-26' en la hoja del país." },
  ],
  preview: { added: 0, removed: 0, changed: 0 },
  upload_token: null,
}

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

async function renderWizard() {
  const { UniversoUploadWizard } = await import("@/modules/pesaje/params/UniversoUploadWizard")
  return render(
    <QueryClientProvider client={createClient()}>
      <UniversoUploadWizard pais="chile" country="Chile" open onOpenChange={() => {}} />
    </QueryClientProvider>,
  )
}

function makeXlsx(name: string) {
  return new File(["binary-xlsx"], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

function selectFile(name: string) {
  const input = screen.getByTestId("universo-file-input") as HTMLInputElement
  fireEvent.change(input, { target: { files: [makeXlsx(name)] } })
}

describe("UniversoUploadWizard (Excel upload → validate → preview → publish)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpload.mockResolvedValue(VALID_RESP)
    // Nested `version` object — mirrors the real JAA-580 UniversoPublishResponse.
    mockPublish.mockResolvedValue({
      country: "chile",
      table: "universo",
      unchanged: false,
      row_count: 7,
      version: {
        version: 1,
        version_id: "wv_universo_chile_1",
        hash: "deadbeef",
        published_by: "dev@local",
        published_at: "2026-06-25T12:00:00Z",
        diff: {},
      },
    })
  })

  it("ac1: a valid xlsx shows the preview diff and enables Publicar", async () => {
    await renderWizard()

    // Publicar starts disabled (nothing uploaded yet).
    expect(screen.getByTestId("universo-publish")).toBeDisabled()

    selectFile("Universo.xlsx")

    await waitFor(() => expect(mockUpload).toHaveBeenCalledWith("chile", expect.any(File)))

    const preview = await screen.findByTestId("universo-preview")
    expect(within(preview).getByTestId("preview-added")).toHaveTextContent("1")
    expect(within(preview).getByTestId("preview-removed")).toHaveTextContent("0")
    expect(within(preview).getByTestId("preview-changed")).toHaveTextContent("1")

    await waitFor(() => expect(screen.getByTestId("universo-publish")).toBeEnabled())
  })

  it("ac2: an invalid xlsx shows which row/column fails and keeps Publicar disabled", async () => {
    mockUpload.mockResolvedValue(INVALID_RESP)
    await renderWizard()

    selectFile("Universo-invalid.xlsx")

    const errors = await screen.findByTestId("universo-upload-errors")
    // Row-scoped error → "fila 4 · Q2-26" (row index 3, 1-based) + its message.
    expect(within(errors).getByText(/fila 4 · Q2-26/)).toBeInTheDocument()
    expect(within(errors).getByText(/Se esperaba un entero/)).toBeInTheDocument()
    // Non-row error → just the column name.
    expect(within(errors).getByText(/Falta la columna 'Q1-26'/)).toBeInTheDocument()

    expect(screen.queryByTestId("universo-preview")).not.toBeInTheDocument()
    expect(screen.getByTestId("universo-publish")).toBeDisabled()
    expect(mockPublish).not.toHaveBeenCalled()
  })

  it("ac3: Publicar confirms the upload_token and persists the new version", async () => {
    const user = userEvent.setup()
    await renderWizard()

    selectFile("Universo.xlsx")
    await waitFor(() => expect(screen.getByTestId("universo-publish")).toBeEnabled())

    await user.click(screen.getByTestId("universo-publish"))

    await waitFor(() => expect(mockPublish).toHaveBeenCalledTimes(1))
    expect(mockPublish).toHaveBeenCalledWith("chile", "utok_chile_1")

    // The success toast reads the NESTED version object (data.version.version),
    // matching the real JAA-580 contract — a flat number would render "v[object Object]".
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Universo · Chile publicado",
        expect.objectContaining({ description: expect.stringContaining("v1") }),
      ),
    )
  })
})

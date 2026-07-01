import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

// Mock the weighting-params API module — the wiring under test.
const mockGetIdPeso = vi.fn()
const mockGetVariables = vi.fn()
const mockGetUniverso = vi.fn()
const mockValidate = vi.fn()
const mockPublish = vi.fn()

vi.mock("@/modules/pesaje/params/api", () => ({
  getIdPesoConfig: (...a: unknown[]) => mockGetIdPeso(...a),
  getWeightingVariables: (...a: unknown[]) => mockGetVariables(...a),
  getUniverso: (...a: unknown[]) => mockGetUniverso(...a),
  validateWeightingParams: (...a: unknown[]) => mockValidate(...a),
  publishWeightingParams: (...a: unknown[]) => mockPublish(...a),
}))

const ID_PESO_ROWS = [
  { idpeso: 1, nombre: "Mensual", per_min: 1, periodos: 1, obs: "todos los meses" },
  { idpeso: 5, nombre: "Ult6", per_min: 5, periodos: 6, obs: null },
]

const UNIVERSO_RESP = {
  country: "chile",
  rows: [
    { categoria: "TOTAL Hogares", expresion: "[ALL]", jerarquia: 0, secuencia: 0, marginales: 0, marginales_por_periodo: { "Q3-25": 100, "Q4-25": 100, "Q1-26": 100, "Q2-26": 100 } },
  ],
  version: { hash: "abcdef1234", modified_at: "2026-06-01T00:00:00Z", row_count: 1 },
}

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

async function renderTab() {
  const { PesajeParametrosTab } = await import("@/modules/pesaje/components/PesajeParametrosTab")
  return render(
    <QueryClientProvider client={createClient()}>
      <PesajeParametrosTab />
    </QueryClientProvider>,
  )
}

describe("PesajeParametrosTab (wired to weighting-params API)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetIdPeso.mockResolvedValue({ country: "chile", rows: ID_PESO_ROWS })
    mockGetVariables.mockResolvedValue({ country: "chile", q_vars: ["EDBEQ"], m_vars: [] })
    mockGetUniverso.mockResolvedValue(UNIVERSO_RESP)
    mockValidate.mockResolvedValue({ valid: true, errors: [] })
    mockPublish.mockResolvedValue({ country: "chile", table: "idpeso-config", version: 2, unchanged: false, author: "dev@local", published_at: "x", hash: "h", diff: { added_count: 0, removed_count: 0, changed_count: 1 } })
  })

  it("ac1: shows the 3 volatility levels in order and the advanced level starts collapsed", async () => {
    await renderTab()

    const h2s = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)
    expect(h2s[0]).toContain("De ejecución")
    expect(h2s[1]).toContain("Insumos versionados")
    // Advanced is a button toggle, not a visible <h2>, and its content is hidden.
    expect(screen.getByText("Estáticos / Avanzados")).toBeInTheDocument()
    expect(screen.queryByTestId("advanced-content")).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId("advanced-toggle"))
    expect(await screen.findByTestId("advanced-content")).toBeInTheDocument()
    expect(screen.getByText("METODO_BOUNDS")).toBeInTheDocument()
  })

  it("ac2: IdPeso_Config rows come from the API per country", async () => {
    await renderTab()
    // JAA-752: the weighting-params API is keyed by país CODE (default CL), not name.
    await waitFor(() => expect(mockGetIdPeso).toHaveBeenCalledWith("CL"))
    expect((await screen.findByTestId("idpeso-nombre-1")).getAttribute("value")).toBe("Mensual")
    expect(screen.getByTestId("idpeso-nombre-5").getAttribute("value")).toBe("Ult6")
  })

  it("ac3: edit + Revisar y publicar calls publish and returns to 'Sin cambios'", async () => {
    const user = userEvent.setup()
    await renderTab()

    const nombre = await screen.findByTestId("idpeso-nombre-1")
    // Initially clean
    expect(screen.getAllByTestId("status-pill")[0]).toHaveTextContent("Sin cambios")

    fireEvent.change(nombre, { target: { value: "Mensual-v2" } })
    await waitFor(() => expect(screen.getAllByTestId("status-pill")[0]).toHaveTextContent(/cambio/))

    await user.click(screen.getByTestId("open-review"))
    const confirm = await screen.findByTestId("confirm-publish")
    await waitFor(() => expect(confirm).toBeEnabled())
    await user.click(confirm)

    await waitFor(() => expect(mockPublish).toHaveBeenCalledTimes(1))
    expect(mockPublish).toHaveBeenCalledWith("CL", "idpeso-config", {
      rows: [{ idpeso: 1, nombre: "Mensual-v2", per_min: 1, periodos: 1, obs: "todos los meses" }, ID_PESO_ROWS[1]],
    })
    await waitFor(() => expect(screen.getAllByTestId("status-pill")[0]).toHaveTextContent("Sin cambios"))
  })

  it("ac4: server validation errors are shown inline and block publishing", async () => {
    mockValidate.mockResolvedValue({
      valid: false,
      errors: [{ row: 0, field: "periodos", message: "Periodos debe ser un entero ≥ 1." }],
    })
    const user = userEvent.setup()
    await renderTab()

    const nombre = await screen.findByTestId("idpeso-nombre-1")
    fireEvent.change(nombre, { target: { value: "Mensual-x" } }) // client-valid edit → dirty

    await user.click(screen.getByTestId("open-review"))
    const dialog = await screen.findByTestId("review-dialog")
    expect(await within(dialog).findByText(/Periodos debe ser un entero/)).toBeInTheDocument()
    expect(within(dialog).getByText(/fila 1 · periodos/)).toBeInTheDocument()
    expect(screen.getByTestId("confirm-publish")).toBeDisabled()
    expect(mockPublish).not.toHaveBeenCalled()
  })
})

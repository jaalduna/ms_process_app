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
const mockGetExecutionParams = vi.fn()
const mockValidate = vi.fn()
const mockPublish = vi.fn()

vi.mock("@/modules/pesaje/params/api", () => ({
  getIdPesoConfig: (...a: unknown[]) => mockGetIdPeso(...a),
  getWeightingVariables: (...a: unknown[]) => mockGetVariables(...a),
  getUniverso: (...a: unknown[]) => mockGetUniverso(...a),
  getExecutionParams: (...a: unknown[]) => mockGetExecutionParams(...a),
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

// F-001 defaults, as GET /execution-params returns them (nothing published yet).
const EXECUTION_PARAMS_RESP = {
  country: "CL",
  params: {
    N_PERIODOS_OUTLIERS: 12,
    MAX_ROUNDS_COLAPSO: 50,
    JERARQUIA_MIN_COLAPSO: 1,
    MANUAL_COLLAPSES: [],
    CORRECAO_BOUNDS: true,
    METODO_BOUNDS: "percentile",
    P_BOUNDS: 2,
    F_BOUNDS: 1.1,
    AGREGACAO_BOUNDS: "union",
    MAX_ERR_RATIO_BOUNDS: 2.0,
  },
  version: null,
}

const PUBLISH_RESP = {
  country: "CL",
  table: "idpeso-config",
  unchanged: false,
  version: { version: 2, version_id: "wv_x_2", hash: "h", published_by: "dev@local", published_at: "x", diff: {} },
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
    mockGetExecutionParams.mockResolvedValue(EXECUTION_PARAMS_RESP)
    mockValidate.mockResolvedValue({ valid: true, errors: [] })
    mockPublish.mockResolvedValue(PUBLISH_RESP)
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

  it("ac2: IdPeso_Config rows come from the API per country (read-only)", async () => {
    await renderTab()
    // JAA-752: the weighting-params API is keyed by país CODE (default CL), not name.
    await waitFor(() => expect(mockGetIdPeso).toHaveBeenCalledWith("CL"))
    expect((await screen.findByTestId("idpeso-nombre-1")).textContent).toBe("Mensual")
    expect(screen.getByTestId("idpeso-nombre-5").textContent).toBe("Ult6")
  })

  it("ac3: only the 4 execution params are editable in nivel 1, seeded from the API", async () => {
    await renderTab()
    await waitFor(() => expect(mockGetExecutionParams).toHaveBeenCalledWith("CL"))

    // The 4 launch-tunable params render as editable controls…
    expect(await screen.findByLabelText("MAX_ROUNDS_COLAPSO")).toHaveValue(50)
    expect(screen.getByLabelText("P_BOUNDS")).toHaveValue(2)
    expect(screen.getByLabelText("F_BOUNDS")).toHaveValue(1.1)
    expect(screen.getByRole("switch", { name: "CORRECAO_BOUNDS" })).toBeInTheDocument()
    // …and the static/advanced ones are NOT in nivel 1 (they live collapsed in nivel 3).
    expect(screen.queryByLabelText("N_PERIODOS_OUTLIERS")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("METODO_BOUNDS")).not.toBeInTheDocument()
  })

  it("ac4: edit + Revisar y publicar publishes the hyperparams dict and returns to 'Sin cambios'", async () => {
    const user = userEvent.setup()
    await renderTab()

    const maxRounds = await screen.findByLabelText("MAX_ROUNDS_COLAPSO")
    // Initially clean
    expect(screen.getAllByTestId("status-pill")[0]).toHaveTextContent("Sin cambios")

    fireEvent.change(maxRounds, { target: { value: "80" } })
    await waitFor(() => expect(screen.getAllByTestId("status-pill")[0]).toHaveTextContent(/cambio/))

    await user.click(screen.getByTestId("exec-params-review"))
    const confirm = await screen.findByTestId("confirm-publish")
    await waitFor(() => expect(confirm).toBeEnabled())
    await user.click(confirm)

    await waitFor(() => expect(mockPublish).toHaveBeenCalledTimes(1))
    const [pais, tabla, payload] = mockPublish.mock.calls[0]
    expect(pais).toBe("CL")
    expect(tabla).toBe("idpeso-config")
    expect(payload.params).toMatchObject({ MAX_ROUNDS_COLAPSO: 80, P_BOUNDS: 2, METODO_BOUNDS: "percentile" })
    await waitFor(() => expect(screen.getAllByTestId("status-pill")[0]).toHaveTextContent("Sin cambios"))
  })

  it("ac5: server validation errors are shown inline and block publishing", async () => {
    mockValidate.mockResolvedValue({
      valid: false,
      errors: [{ row: null, field: "P_BOUNDS", message: "Debe ser un entero con 0 < P_BOUNDS < 50." }],
    })
    const user = userEvent.setup()
    await renderTab()

    const pBounds = await screen.findByLabelText("P_BOUNDS")
    fireEvent.change(pBounds, { target: { value: "5" } }) // client-valid edit → dirty

    await user.click(screen.getByTestId("exec-params-review"))
    const dialog = await screen.findByTestId("review-dialog")
    expect(await within(dialog).findByText(/0 < P_BOUNDS < 50/)).toBeInTheDocument()
    expect(screen.getByTestId("confirm-publish")).toBeDisabled()
    expect(mockPublish).not.toHaveBeenCalled()
  })
})

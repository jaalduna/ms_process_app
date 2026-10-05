import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { QmsTrLaunchPanel } from "../QmsTrLaunchPanel"
import type { QmsTrSnapshot } from "../../types"

const mockResolve = vi.fn()
vi.mock("../../api", () => ({ resolveQmsTrSnapshot: (...a: unknown[]) => mockResolve(...a) }))

const LISTO: QmsTrSnapshot = {
  status: "ready", at: "2026-09-29T18:45:00Z",
  j: { table: "j_atoscompra_new", table_fqn: "b.colombia.j_atoscompra_new", version: 11, timestamp: "2026-09-29T19:08:00Z" },
  tables: [], expected_j_at: null, warnings: [],
}
const ESPERA: QmsTrSnapshot = { ...LISTO, status: "waiting", j: null, expected_j_at: "2026-09-29T19:00:00Z" }

function renderPanel(props: Partial<Parameters<typeof QmsTrLaunchPanel>[0]> = {}) {
  const onLaunch = vi.fn()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <QmsTrLaunchPanel countries={["colombia"]} busy={new Set()} launching={false} canTrigger onLaunch={onLaunch} {...props} />
    </QueryClientProvider>,
  )
  return { onLaunch }
}

async function fijarInstante(valor: string) {
  const input = screen.getByTestId("qmstr-instante")
  await userEvent.clear(input)
  await userEvent.type(input, valor)
}

describe("QmsTrLaunchPanel", () => {
  beforeEach(() => {
    mockResolve.mockReset()
    mockResolve.mockResolvedValue(LISTO)
  })

  it("resuelve el snapshot en hora de Chile y lanza con el instante en UTC", async () => {
    mockResolve.mockResolvedValue(LISTO)
    const { onLaunch } = renderPanel()
    await fijarInstante("2026-09-29T15:45")
    await waitFor(() => expect(mockResolve).toHaveBeenLastCalledWith("colombia", "2026-09-29T18:45:00.000Z"))
    expect(await screen.findByText(/snapshot de J de las/)).toHaveTextContent("16:08 del 29-09")
    await userEvent.clear(screen.getByTestId("qmstr-mes"))
    await userEvent.type(screen.getByTestId("qmstr-mes"), "202608")
    await userEvent.click(screen.getByTestId("qmstr-launch"))
    await userEvent.click(screen.getByTestId("qmstr-launch-confirm"))
    expect(onLaunch).toHaveBeenCalledWith({ country: "colombia", at: "2026-09-29T18:45:00.000Z", mes_procesamiento: "202608" })
  })

  it("avisa que la corrida quedará esperando si el snapshot aún no ocurre", async () => {
    mockResolve.mockResolvedValue(ESPERA)
    renderPanel()
    await fijarInstante("2026-09-29T15:45")
    expect(await screen.findByTestId("qmstr-snapshot-waiting")).toHaveTextContent("16:00 del 29-09")
    expect(screen.getByTestId("qmstr-launch")).toBeEnabled()
  })

  it("no deja lanzar sin rol, con mes inválido o con una corrida activa del país y mes", async () => {
    mockResolve.mockResolvedValue(LISTO)
    renderPanel({ canTrigger: false })
    await screen.findByTestId("qmstr-snapshot")
    expect(screen.getByTestId("qmstr-launch")).toBeDisabled()
  })

  it("con una corrida activa del mismo país y mes el botón queda deshabilitado", async () => {
    mockResolve.mockResolvedValue(LISTO)
    renderPanel({ busy: new Set(["colombia:202608"]) })
    await userEvent.clear(screen.getByTestId("qmstr-mes"))
    await userEvent.type(screen.getByTestId("qmstr-mes"), "202608")
    await screen.findByTestId("qmstr-snapshot")
    expect(screen.getByText(/Ya hay una corrida en curso/)).toBeInTheDocument()
    expect(screen.getByTestId("qmstr-launch")).toBeDisabled()
  })

  it("muestra el error si la API no puede resolver el snapshot", async () => {
    // objeto plano como el resto de los tests del repo (forma de un error de axios con message)
    mockResolve.mockImplementation(() => Promise.reject({ message: "país sin j_atoscompra_new" }))
    renderPanel()
    expect(await screen.findByRole("alert")).toHaveTextContent("país sin j_atoscompra_new")
  })
})

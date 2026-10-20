import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { FlujoBase, Tanda, TandaDecisionCreate } from "../../../types"

const decidirRevision = vi.fn<(tid: string, d: TandaDecisionCreate) => Promise<Tanda>>()
const forzarVuelta = vi.fn(() => Promise.resolve({}))
vi.mock("../../../api", () => ({
  getTandaProgreso: vi.fn(),
  downloadTandaZip: vi.fn(),
  downloadTandaReporte: vi.fn(() => Promise.resolve()),
  decidirRevision: (tid: string, d: TandaDecisionCreate) => decidirRevision(tid, d),
  forzarVuelta: () => forzarVuelta(),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { TandaCard } = await import("../TandaCard")
const { DetalleBase } = await import("../DetalleBase")

const REVISAR = "volumen país al tope del motor y fuera de su caja histórica: revisar el dato"

const tanda = (extra: Partial<Tanda>): Tanda => ({
  id: "t1", pais: "MX", periodo: "202609", numero: 2, categorias: [201, 252], productos: [201, 252], h4_desde: "2026-10-01T12:00:00Z",
  h4_hasta: "2026-10-01T12:00:00Z", estado: "en_revision", estado_previo: null, pausada: false, qms_run_id: null, jira_key: null,
  envio: {}, bypass: [], bypass_motivos: {},
  revisar: [{ producto: 201, motivo: REVISAR, d_vol_pct: -19.9, veces_fuera_de_caja: 2.6 }, { producto: 252, motivo: "Excel, hoja Factores: 3 filas con factor nuevo negativo" }],
  revision: {}, error: null, eventos: [], created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z", tipo: "liberacion",
  modo: "completo", creada_por: null, tanda_origen: null, nota: null, ejecucion: "simulacion", snapshot_desde: null, progreso: null, ...extra,
})

const base = (extra: Partial<FlujoBase> = {}): FlujoBase => ({
  producto: 201, nombre: "Agua", h3: "2026-09-26T10:00:00-03:00", h4: "2026-10-01T09:00:00-03:00", h4_anulado: false,
  h10: null, fuera_de_alcance: false, estado: "pendiente", tanda_id: null, tanda_numero: null, tanda_estado: null, jira_key: null,
  motivo_bypass: null, revisar: null, historial: [], ...extra,
})

function conQuery(ui: React.ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
}

describe("revisión antes del ticket en la tarjeta de la tanda", () => {
  it("lista las bases observadas; excluir pide motivo y con la última decidida se fuerza la vuelta", async () => {
    const user = userEvent.setup()
    const t = tanda({})
    decidirRevision.mockResolvedValueOnce({ ...t, revision: { 201: { decision: "excluir", motivo: "equivalencia ×1000", por: "a", at: "2026-10-16T12:00:00Z" } } })
    render(conQuery(<TandaCard tanda={t} nombres={new Map([[201, "Agua"]])} modo="simulacion" esAdmin verRun={false} ocupado={null}
      onAccion={() => {}} onRevertir={() => {}} />))

    const panel = screen.getByTestId("qf-revision")
    expect(within(panel).getByTestId("qf-revision-cuenta")).toHaveTextContent("0 de 2 decididas")
    expect(within(panel).getByTestId("qf-revision-201")).toHaveTextContent("volumen -19.9% · 2.6× fuera de su caja")

    await user.click(screen.getByTestId("qf-revision-excluir-201"))
    expect(screen.getByTestId("qf-revision-confirmar-201")).toBeDisabled()
    await user.type(screen.getByTestId("qf-revision-motivo-201"), "equivalencia ×1000")
    await user.click(screen.getByTestId("qf-revision-confirmar-201"))
    await waitFor(() => expect(decidirRevision).toHaveBeenCalledWith("t1", { producto: 201, decision: "excluir", motivo: "equivalencia ×1000" }))
    expect(forzarVuelta).not.toHaveBeenCalled() // falta la 252

    decidirRevision.mockResolvedValueOnce({ ...t, revision: {
      201: { decision: "excluir", motivo: "equivalencia ×1000", por: "a", at: "2026-10-16T12:00:00Z" },
      252: { decision: "enviar", motivo: "", por: "a", at: "2026-10-16T12:01:00Z" },
    } })
    await user.click(screen.getByTestId("qf-revision-enviar-252"))
    await waitFor(() => expect(forzarVuelta).toHaveBeenCalledTimes(1))
  })

  it("sin permisos de operación solo se ve; cerrada la revisión quedan las decisiones", () => {
    const t = tanda({ estado: "en_dq", revision: { 201: { decision: "excluir", motivo: "dato", por: "ana@kwp", at: "2026-10-16T12:00:00Z" },
      252: { decision: "enviar", motivo: "", por: "ana@kwp", at: "2026-10-16T12:00:00Z" } } })
    render(conQuery(<TandaCard tanda={t} nombres={new Map()} modo="simulacion" esAdmin={false} verRun={false} ocupado={null}
      onAccion={() => {}} onRevertir={() => {}} />))
    expect(screen.getByTestId("qf-revision-201")).toHaveAttribute("data-decision", "excluir")
    expect(screen.getByTestId("qf-revision-252")).toHaveTextContent("Va en el ticket")
    expect(screen.queryByTestId("qf-revision-enviar-252")).toBeNull()
  })
})

describe("detalle de una base", () => {
  const props = { pais: "MX", paisEtiqueta: "México", periodo: "202609", lanzando: false, onOpenChange: () => {}, onVerTanda: () => {} }

  it("muestra hitos e historial y lanza solo esa base", async () => {
    const user = userEvent.setup()
    const onLanzar = vi.fn()
    const b = base({ historial: [{ at: "2026-10-02T12:00:00Z", tanda_id: "t0", tipo: "liberacion", evento: "tanda 1 (liberacion): cerrada" }] })
    render(<DetalleBase {...props} base={b} puedeOperar onLanzar={onLanzar} />)
    expect(screen.getByTestId("qf-detalle-historial")).toHaveTextContent("tanda 1 (liberacion): cerrada")
    await user.click(screen.getByTestId("qf-detalle-modo-solo_correr"))
    await user.type(screen.getByTestId("qf-detalle-nota"), "probar el guard")
    await user.click(screen.getByTestId("qf-detalle-lanzar-btn"))
    expect(onLanzar).toHaveBeenCalledWith({ pais: "MX", periodo: "202609", productos: [201], modo: "solo_correr", forzar: false, nota: "probar el guard" })
  })

  it("sin hito 4 pide forzar; en QMS-TR no deja lanzar y lleva a su tanda", async () => {
    const user = userEvent.setup()
    const onVerTanda = vi.fn()
    const { rerender } = render(<DetalleBase {...props} base={base({ h4: null, estado: "retenida" })} puedeOperar onLanzar={vi.fn()} />)
    expect(screen.getByTestId("qf-detalle-lanzar-btn")).toBeDisabled()
    await user.click(screen.getByTestId("qf-detalle-forzar"))
    expect(screen.getByTestId("qf-detalle-lanzar-btn")).toBeEnabled()

    rerender(<DetalleBase {...props} onVerTanda={onVerTanda}
      base={base({ estado: "en_proceso", tanda_numero: 3, tanda_estado: "en_revision", revisar: REVISAR })} puedeOperar onLanzar={vi.fn()} />)
    expect(screen.getByTestId("qf-detalle-bloqueo")).toHaveTextContent("Ya está en la tanda 3")
    expect(screen.getByTestId("qf-detalle-motivos")).toHaveTextContent(REVISAR)
    await user.click(screen.getByTestId("qf-detalle-ver-tanda"))
    expect(onVerTanda).toHaveBeenCalledWith(3)
  })

  it("sin permisos de operación no ofrece lanzar", () => {
    render(<DetalleBase {...props} base={base()} puedeOperar={false} onLanzar={vi.fn()} />)
    expect(screen.queryByTestId("qf-detalle-lanzar")).toBeNull()
    expect(screen.getByTestId("qf-detalle-sin-historial")).toBeVisible()
  })
})


describe("entrega directa con PythonCac: sin zip ni ticket", () => {
  it("la tanda cerrada ofrece el reporte y no el zip; la revisión es antes de aplicar", async () => {
    const { rerender } = render(conQuery(<TandaCard tanda={tanda({ estado: "cerrada", revisar: [] })} nombres={new Map()} modo="simulacion"
      entrega="pythoncac" esAdmin verRun={false} ocupado={null} onAccion={() => {}} onRevertir={() => {}} />))
    expect(screen.getByTestId("qf-accion-reporte")).toHaveTextContent("Descargar reporte")
    expect(screen.queryByTestId("qf-accion-zip")).not.toBeInTheDocument()
    rerender(conQuery(<TandaCard tanda={tanda({})} nombres={new Map()} modo="simulacion" entrega="pythoncac" esAdmin verRun={false}
      ocupado={null} onAccion={() => {}} onRevertir={() => {}} />))
    expect(screen.getByTestId("qf-revision")).toHaveTextContent("Revisión antes de aplicar")
    expect(screen.getByTestId("qf-revision")).not.toHaveTextContent(/zip|ticket/i)
  })

  it("el detalle de la base no habla de ticket, zip ni hito 10", () => {
    render(conQuery(<DetalleBase base={base({ estado: "aplicada", revisar: "dato a revisar" })} pais="BO" paisEtiqueta="Bolivia" periodo="202608"
      puedeOperar lanzando={false} onOpenChange={() => {}} onLanzar={() => {}} onVerTanda={() => {}} entrega="pythoncac" />))
    const detalle = screen.getByTestId("qf-detalle")
    expect(detalle).toHaveTextContent("aplicó los ajustes en J con PythonCac")
    expect(detalle).toHaveTextContent("Observada antes de aplicar")
    expect(detalle).not.toHaveTextContent(/zip|ticket|hito 10/i)
  })
})

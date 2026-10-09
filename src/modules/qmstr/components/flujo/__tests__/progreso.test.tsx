import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { Tanda, TandaProgreso } from "../../../types"

const getTandaProgreso = vi.fn<(tid: string) => Promise<TandaProgreso>>()
vi.mock("../../../api", () => ({
  getTandaProgreso: (tid: string) => getTandaProgreso(tid),
  downloadTandaZip: vi.fn(),
}))

const { TandaCard } = await import("../TandaCard")

const tanda = (extra: Partial<Tanda>): Tanda => ({
  id: "t1", pais: "EC", periodo: "202609", numero: 4, categorias: [1], productos: [1], h4_desde: "2026-10-01T12:00:00Z",
  h4_hasta: "2026-10-01T12:00:00Z", estado: "corriendo", estado_previo: null, pausada: false, qms_run_id: "r1", jira_key: null,
  envio: {}, bypass: [], validacion: {}, error: null, eventos: [], created_at: "", updated_at: "", tipo: "liberacion",
  modo: "completo", creada_por: null, tanda_origen: null, nota: null, ejecucion: "simulacion", snapshot_desde: null, progreso: null, ...extra,
})

const progreso = (listos: number, terminada: boolean, fallidos = 0): TandaProgreso => ({
  run_id: 1, estado: terminada ? "TERMINATED" : "RUNNING", run_page_url: "https://x", inicio: "2026-10-08T15:00:00Z",
  fin: terminada ? "2026-10-08T15:20:00Z" : null, productos_total: 26, productos_listos: listos,
  productos_fallidos: fallidos, porcentaje: Math.round(((listos + fallidos) / 26) * 100), tareas: [],
})

describe("progreso de la corrida en la tarjeta de la tanda", () => {
  it("al terminar la corrida pide el progreso final en vez de mostrar la última lectura en vivo", async () => {
    getTandaProgreso.mockResolvedValueOnce(progreso(24, false)).mockResolvedValueOnce(progreso(26, true))
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const card = (t: Tanda) => (
      <QueryClientProvider client={qc}>
        <TandaCard tanda={t} nombres={new Map()} modo="simulacion" esAdmin={false} verRun={false} ocupado={null}
          onAccion={() => {}} onRevertir={() => {}} />
      </QueryClientProvider>
    )
    const { rerender } = render(card(tanda({ estado: "corriendo" })))
    expect(await screen.findByTestId("qf-progreso-pct")).toHaveTextContent("92%")

    rerender(card(tanda({ estado: "enviando" })))
    await waitFor(() => expect(screen.getByTestId("qf-progreso-fin")).toHaveTextContent("26 de 26 productos"))
    expect(getTandaProgreso).toHaveBeenCalledTimes(2)
  })
})

describe("productos fallidos en la corrida", () => {
  const card = (t: Tanda) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TandaCard tanda={t} nombres={new Map()} modo="simulacion" esAdmin={false} verRun={false} ocupado={null}
        onAccion={() => {}} onRevertir={() => {}} />
    </QueryClientProvider>
  )
  it("en vivo muestra las listas y el indicador de fallidas", async () => {
    getTandaProgreso.mockResolvedValueOnce(progreso(12, false, 1))
    render(card(tanda({ estado: "corriendo" })))
    expect(await screen.findByText(/12 de 26 productos listos/)).toBeInTheDocument()
    expect(screen.getByTestId("qf-progreso-fallidos")).toHaveTextContent("1 con error (quedan en bypass)")
  })
  it("sin fallidas no muestra el indicador", async () => {
    getTandaProgreso.mockResolvedValueOnce(progreso(12, false))
    render(card(tanda({ estado: "corriendo", id: "t-sin" })))
    await screen.findByTestId("qf-progreso-pct")
    expect(screen.queryByTestId("qf-progreso-fallidos")).toBeNull()
  })
  it("al terminar también lo indica", () => {
    render(card(tanda({ estado: "cerrada", progreso: progreso(25, true, 1) })))
    expect(screen.getByTestId("qf-progreso-fin")).toHaveTextContent("25 de 26 productos")
    expect(screen.getByTestId("qf-progreso-fallidos")).toHaveTextContent("1 con error")
  })
})

describe("campos nuevos de la tanda", () => {
  const card = (t: Tanda) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TandaCard tanda={t} nombres={new Map()} modo="simulacion" esAdmin={false} verRun={false} ocupado={null}
        onAccion={() => {}} onRevertir={() => {}} />
    </QueryClientProvider>
  )
  it("con progreso final en la tanda no pide /progreso", async () => {
    getTandaProgreso.mockClear()
    render(card(tanda({ estado: "cerrada", progreso: progreso(26, true) })))
    expect(await screen.findByTestId("qf-progreso-fin")).toHaveTextContent("26 de 26 productos")
    expect(getTandaProgreso).not.toHaveBeenCalled()
  })
  it("muestra desde cuándo se toma el snapshot de J", () => {
    render(card(tanda({ snapshot_desde: "2026-10-08T15:00:00Z" })))
    expect(screen.getByTestId("qf-snapshot-desde")).toHaveTextContent(/Snapshot de J desde/)
  })
  it("un GRANT pendiente es un bloqueo ámbar, no una falla", () => {
    render(card(tanda({ estado: "hito10", error: "sin permiso UPDATE sobre t.x en Ecuador (pedir GRANT, ver JAA-1442)" })))
    expect(screen.getByTestId("qf-bloqueo-permiso")).toHaveTextContent("sin permiso UPDATE")
    expect(screen.queryByRole("alert")).toBeNull()
  })
  it("otro error sigue siendo una alerta", () => {
    render(card(tanda({ error: "falló la corrida" })))
    expect(screen.getByRole("alert")).toHaveTextContent("falló la corrida")
    expect(screen.queryByTestId("qf-bloqueo-permiso")).toBeNull()
  })
})

describe("corrida esperando el snapshot de J", () => {
  it("no muestra 0% ni un link vacío: dice que espera el snapshot", async () => {
    getTandaProgreso.mockResolvedValueOnce({
      run_id: null, estado: "WAITING_SNAPSHOT", run_page_url: null, inicio: null, fin: null,
      productos_total: 1, productos_listos: 0, productos_fallidos: 0, porcentaje: 0, tareas: [],
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <TandaCard tanda={tanda({ estado: "corriendo", qms_run_id: "r9", id: "t9" })} nombres={new Map()} modo="simulacion"
          esAdmin verRun ocupado={null} onAccion={() => {}} onRevertir={() => {}} />
      </QueryClientProvider>,
    )
    expect(await screen.findByTestId("qf-progreso-espera")).toHaveTextContent("Esperando el snapshot de J")
    expect(screen.queryByTestId("qf-progreso-pct")).toBeNull()
    expect(screen.queryByRole("link", { name: /Databricks/ })).toBeNull()
  })
})

describe("acciones de la tanda", () => {
  it("una tanda solo correr cerrada no ofrece revertir; una completa sí", () => {
    const qc = new QueryClient()
    const card = (t: Tanda) => (
      <QueryClientProvider client={qc}>
        <TandaCard tanda={t} nombres={new Map()} modo="simulacion" esAdmin verRun={false} ocupado={null}
          onAccion={() => {}} onRevertir={() => {}} />
      </QueryClientProvider>
    )
    const { rerender } = render(card(tanda({ estado: "cerrada", qms_run_id: null, modo: "solo_correr" })))
    expect(screen.queryByTestId("qf-accion-revertir")).toBeNull()
    rerender(card(tanda({ estado: "cerrada", qms_run_id: null, modo: "completo" })))
    expect(screen.getByTestId("qf-accion-revertir")).toBeVisible()
  })

  it("verificando o en hito 10 no ofrece revertir: la API responde 409 mientras sus bases siguen en curso", () => {
    const qc = new QueryClient()
    const card = (t: Tanda) => (
      <QueryClientProvider client={qc}>
        <TandaCard tanda={t} nombres={new Map()} modo="simulacion" esAdmin verRun={false} ocupado={null}
          onAccion={() => {}} onRevertir={() => {}} />
      </QueryClientProvider>
    )
    const { rerender } = render(card(tanda({ estado: "verificando", qms_run_id: null })))
    expect(screen.queryByTestId("qf-accion-revertir")).toBeNull()
    rerender(card(tanda({ estado: "hito10", qms_run_id: null })))
    expect(screen.queryByTestId("qf-accion-revertir")).toBeNull()
  })

  it("una tanda creada en otro modo del flujo se marca y no ofrece simular cierre ni revertir", () => {
    const qc = new QueryClient()
    const card = (t: Tanda, modo: "simulacion" | "real") => (
      <QueryClientProvider client={qc}>
        <TandaCard tanda={t} nombres={new Map()} modo={modo} esAdmin verRun={false} ocupado={null}
          onAccion={() => {}} onRevertir={() => {}} />
      </QueryClientProvider>
    )
    const { rerender } = render(card(tanda({ estado: "en_dq", qms_run_id: null, jira_key: "LAT-1", ejecucion: "real" }), "simulacion"))
    expect(screen.getByTestId("qf-tanda-ejecucion")).toHaveTextContent("Real")
    expect(screen.queryByTestId("qf-accion-simular_cierre_ticket")).toBeNull()
    rerender(card(tanda({ estado: "cerrada", qms_run_id: null, ejecucion: "simulacion" }), "real"))
    expect(screen.getByTestId("qf-tanda-ejecucion")).toHaveTextContent("Simulada")
    expect(screen.queryByTestId("qf-accion-revertir")).toBeNull()
    rerender(card(tanda({ estado: "en_dq", qms_run_id: null, jira_key: "SIM-1" }), "simulacion"))
    expect(screen.queryByTestId("qf-tanda-ejecucion")).toBeNull()
    expect(screen.getByTestId("qf-accion-simular_cierre_ticket")).toBeVisible()
  })

  it("muestra la nota del lanzamiento y el motivo de la reversión", () => {
    const qc = new QueryClient()
    const card = (t: Tanda) => (
      <QueryClientProvider client={qc}>
        <TandaCard tanda={t} nombres={new Map()} modo="simulacion" esAdmin={false} verRun={false} ocupado={null}
          onAccion={() => {}} onRevertir={() => {}} />
      </QueryClientProvider>
    )
    const { rerender } = render(card(tanda({ estado: "cerrada", qms_run_id: null, tipo: "manual", nota: "DC re-liberó Café" })))
    expect(screen.getByTestId("qf-tanda-nota")).toHaveTextContent("Nota: DC re-liberó Café")
    rerender(card(tanda({ estado: "cerrada", qms_run_id: null, tipo: "reversion", nota: "pedido de DC" })))
    expect(screen.getByTestId("qf-tanda-nota")).toHaveTextContent("Motivo: pedido de DC")
  })
})

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
  modo: "completo", creada_por: null, tanda_origen: null, correos: {}, ...extra,
})

const progreso = (listos: number, terminada: boolean): TandaProgreso => ({
  run_id: 1, estado: terminada ? "TERMINATED" : "RUNNING", run_page_url: "https://x", inicio: "2026-10-08T15:00:00Z",
  fin: terminada ? "2026-10-08T15:20:00Z" : null, productos_total: 26, productos_listos: listos,
  porcentaje: Math.round((listos / 26) * 100), tareas: [],
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
})

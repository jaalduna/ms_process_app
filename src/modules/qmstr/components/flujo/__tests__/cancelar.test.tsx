import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { Tanda } from "../../../types"

vi.mock("../../../api", () => ({
  getTandaProgreso: vi.fn(() => new Promise(() => {})),
  downloadTandaZip: vi.fn(),
  downloadTandaReporte: vi.fn(),
}))

const { TandaCard } = await import("../TandaCard")

const tanda = (extra: Partial<Tanda>): Tanda => ({
  id: "t1", pais: "BO", periodo: "202609", numero: 1, categorias: [1], productos: [1], h4_desde: "2026-10-01T12:00:00Z",
  h4_hasta: "2026-10-01T12:00:00Z", estado: "validando", estado_previo: null, pausada: false, qms_run_id: null, jira_key: null,
  envio: {}, bypass: [], bypass_motivos: {}, revisar: [], revision: {}, error: null, eventos: [], created_at: "2026-10-01T12:00:00Z",
  updated_at: "2026-10-01T12:00:00Z", tipo: "manual", modo: "completo", creada_por: "dc@kwp", tanda_origen: null, nota: null,
  ejecucion: "simulacion", snapshot_desde: null, progreso: null, ...extra,
})

const card = (t: Tanda, onAccion = vi.fn()) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <TandaCard tanda={t} nombres={new Map()} modo="simulacion" entrega="pythoncac" esAdmin verRun={false} ocupado={null}
      onAccion={onAccion} onRevertir={() => {}} />
  </QueryClientProvider>
)

describe("bases revertidas después", () => {
  it("la tanda marca la base revertida y cuenta cuántas", async () => {
    const t = tanda({ estado: "cerrada", productos: [1, 2] })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TandaCard tanda={t} nombres={new Map([[1, "Leche"], [2, "Café"]])} modo="simulacion" entrega="pythoncac" esAdmin verRun={false}
          ocupado={null} onAccion={() => {}} onRevertir={() => {}} revertidas={new Map([[2, { numero: 3, cerrada: true }]])} />
      </QueryClientProvider>,
    )
    expect(screen.getByTestId("qf-tanda-revertidas")).toHaveTextContent("1 revertida")
    await userEvent.click(screen.getByText("2 bases"))
    expect(screen.getByTestId("qf-tanda-base-2")).toHaveTextContent("revertida")
    expect(screen.getByTestId("qf-tanda-base-1")).not.toHaveTextContent("revertida")
  })
})

describe("cancelar una tanda", () => {
  it("antes de aplicar se puede cancelar, con confirmación", async () => {
    const onAccion = vi.fn()
    render(card(tanda({}), onAccion))
    await userEvent.click(screen.getByTestId("qf-accion-cancelar-pedir"))
    expect(screen.getByTestId("qf-cancelar-confirmar")).toHaveTextContent("sus bases quedan libres")
    expect(onAccion).not.toHaveBeenCalled()
    await userEvent.click(screen.getByTestId("qf-accion-cancelar"))
    expect(onAccion).toHaveBeenCalledWith("cancelar")
  })
  it("aplicando, cerrada o cancelada no se puede cancelar", () => {
    for (const estado of ["aplicando", "cerrada", "cancelada"] as const) {
      const { unmount } = render(card(tanda({ estado })))
      expect(screen.queryByTestId("qf-accion-cancelar-pedir")).toBeNull()
      unmount()
    }
  })
  it("en revisión manual después de aplicar tampoco: se revierte", () => {
    render(card(tanda({ estado: "revision_manual", estado_previo: "aplicando" })))
    expect(screen.queryByTestId("qf-accion-cancelar-pedir")).toBeNull()
  })
})

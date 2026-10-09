import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { periodoLabel, relativo } from "../formato"
import { Stepper } from "../TandaCard"
import { TableroBases } from "../TableroBases"
import { pollTandas } from "../../../hooks/useQmsTrFlujo"
import type { FlujoBase, Tanda } from "../../../types"

const base = (producto: number, estado: FlujoBase["estado"], extra: Partial<FlujoBase> = {}): FlujoBase => ({
  producto, nombre: `Base ${producto}`, h3: "2026-09-26T10:00:00-03:00", h4: "2026-10-01T09:00:00-03:00", h4_anulado: false,
  h10: null, fuera_de_alcance: false, estado, tanda_id: null, tanda_numero: null, tanda_estado: null, jira_key: null,
  historial: [], ...extra,
})

const tanda = (extra: Partial<Tanda>): Tanda => ({
  id: "t", pais: "EC", periodo: "202609", numero: 1, categorias: [1], productos: [1], h4_desde: "2026-10-01T12:00:00Z",
  h4_hasta: "2026-10-01T12:00:00Z", estado: "detectada", estado_previo: null, pausada: false, qms_run_id: null, jira_key: null,
  envio: {}, bypass: [], validacion: {}, error: null, eventos: [], created_at: "", updated_at: "", tipo: "liberacion",
  modo: "completo", creada_por: null, tanda_origen: null, correos: {}, ...extra,
})

describe("formato del flujo QMS-TR", () => {
  it("período AAAAMM en palabras; uno inválido es un error, no un texto vacío", () => {
    expect(periodoLabel("202609")).toBe("septiembre 2026")
    expect(() => periodoLabel("202613")).toThrow(/período inválido/)
  })
  it("tiempo relativo", () => {
    const ahora = Date.parse("2026-10-08T15:00:00Z")
    expect(relativo("2026-10-08T14:57:00Z", ahora)).toBe("hace 3 min")
    expect(relativo("2026-10-08T13:00:00Z", ahora)).toBe("hace 2 h")
  })
  it("polling: 10 s con tandas avanzando, 60 s si están quietas o pausadas", () => {
    expect(pollTandas([tanda({ estado: "corriendo" })])).toBe(10_000)
    expect(pollTandas([tanda({ estado: "corriendo", pausada: true })])).toBe(60_000)
    expect(pollTandas([tanda({ estado: "cerrada" })])).toBe(60_000)
  })
})

describe("Stepper", () => {
  it("marca el paso actual y en revisión manual el paso donde se detuvo", () => {
    const { rerender, container } = render(<Stepper tanda={tanda({ estado: "en_dq" })} />)
    const estado = (p: string) => container.querySelector(`[data-paso="${p}"]`)?.getAttribute("data-estado")
    expect(estado("corriendo")).toBe("hecho")
    expect(estado("en_dq")).toBe("actual")
    expect(estado("cerrada")).toBe("pendiente")
    rerender(<Stepper tanda={tanda({ estado: "revision_manual", estado_previo: "verificando" })} />)
    expect(estado("verificando")).toBe("error")
  })
  it("la reversión arma el zip inverso en vez de correr; solo correr salta directo a cerrada", () => {
    const { container, rerender } = render(<Stepper tanda={tanda({ tipo: "reversion" })} />)
    expect(container.querySelector('[data-paso="armando_reversion"]')).not.toBeNull()
    expect(container.querySelector('[data-paso="corriendo"]')).toBeNull()
    rerender(<Stepper tanda={tanda({ modo: "solo_correr" })} />)
    expect([...container.querySelectorAll("[data-paso]")].map((e) => e.getAttribute("data-paso"))).toEqual(["detectada", "corriendo", "cerrada"])
  })
})

describe("TableroBases", () => {
  it("una celda por base, KPIs y la leyenda filtra", async () => {
    const onFiltro = vi.fn()
    const bases = [base(1, "aplicada"), base(2, "aplicada"), base(3, "retenida", { h4: null }), base(4, "en_proceso", { tanda_estado: "corriendo" })]
    render(<TableroBases pais="Ecuador" periodo="202609" bases={bases} filtro={null} onFiltro={onFiltro} />)
    expect(screen.getAllByRole("listitem").filter((e) => e.hasAttribute("data-estado"))).toHaveLength(4)
    expect(screen.getByTestId("qf-kpi-h4")).toHaveTextContent("3/ 4")
    expect(screen.getByTestId("qf-kpi-aplicadas")).toHaveTextContent("2")
    await userEvent.click(screen.getByRole("button", { name: /Retenidas/ }))
    expect(onFiltro).toHaveBeenCalledWith("retenida")
  })
})

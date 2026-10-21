import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { nBases, periodoLabel, relativo } from "../formato"
import { Stepper } from "../TandaCard"
import { TableroBases } from "../TableroBases"
import { bloqueo } from "../bloqueo"
import { pollTandas } from "../../../hooks/useQmsTrFlujo"
import type { FlujoBase, Tanda } from "../../../types"

const base = (producto: number, estado: FlujoBase["estado"], extra: Partial<FlujoBase> = {}): FlujoBase => ({
  producto, nombre: `Base ${producto}`, h3: "2026-09-26T10:00:00-03:00", h4: "2026-10-01T09:00:00-03:00", h4_anulado: false,
  h10: null, fuera_de_alcance: false, estado, tanda_id: null, tanda_numero: null, tanda_estado: null, jira_key: null, motivo_bypass: null, revisar: null,
  historial: [], ...extra,
})

const tanda = (extra: Partial<Tanda>): Tanda => ({
  id: "t", pais: "EC", periodo: "202609", numero: 1, categorias: [1], productos: [1], h4_desde: "2026-10-01T12:00:00Z",
  h4_hasta: "2026-10-01T12:00:00Z", estado: "detectada", estado_previo: null, pausada: false, qms_run_id: null, jira_key: null,
  envio: {}, bypass: [], bypass_motivos: {}, revisar: [], revision: {}, error: null, eventos: [], created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z", tipo: "liberacion",
  modo: "completo", creada_por: null, tanda_origen: null, nota: null, ejecucion: "simulacion", snapshot_desde: null, progreso: null, ...extra,
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
    expect(relativo("2026-10-08T14:59:57Z", ahora)).toBe("recién")
    // una vuelta que llegó después del último tic de `ahora` sigue siendo pasada
    expect(relativo("2026-10-08T15:00:17Z", ahora)).toBe("recién")
  })
  it("cuenta bases en singular y plural", () => {
    expect(nBases(1)).toBe("1 base")
    expect(nBases(3)).toBe("3 bases")
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
    rerender(<Stepper tanda={tanda({ estado: "revision_manual", estado_previo: "enviando" })} />)
    expect(estado("enviando")).toBe("error")
    expect(container.querySelector('[data-paso="verificando"]')).toBeNull() // ya no se verifica en J
  })
  it("la revisión antes del ticket es el paso de validación", () => {
    const { container } = render(<Stepper tanda={tanda({ estado: "en_revision" })} />)
    const paso = container.querySelector('[data-paso="validando"]')
    expect(paso?.getAttribute("data-estado")).toBe("actual")
    expect(paso).toHaveTextContent("Revisión")
    expect(container.querySelector('[data-paso="corriendo"]')?.getAttribute("data-estado")).toBe("hecho")
  })
  it("la reversión arma el zip inverso en vez de correr; solo correr salta directo a cerrada", () => {
    const { container, rerender } = render(<Stepper tanda={tanda({ tipo: "reversion" })} />)
    expect(container.querySelector('[data-paso="armando_reversion"]')).not.toBeNull()
    expect(container.querySelector('[data-paso="corriendo"]')).toBeNull()
    rerender(<Stepper tanda={tanda({ modo: "solo_correr" })} />)
    expect([...container.querySelectorAll("[data-paso]")].map((e) => e.getAttribute("data-paso"))).toEqual(["detectada", "corriendo", "cerrada"])
  })
  it("el primer paso es Detectada solo en la liberación con ticket; si alguien la lanza es Lanzada", () => {
    const primero = (c: HTMLElement) => c.querySelector('[data-paso="detectada"]')
    const { container, rerender } = render(<Stepper tanda={tanda({})} />)
    expect(primero(container)).toHaveTextContent("Detectada")
    rerender(<Stepper tanda={tanda({ tipo: "manual" })} />)
    expect(primero(container)).toHaveTextContent("Lanzada")
    rerender(<Stepper tanda={tanda({})} entrega="pythoncac" />)
    expect(primero(container)).toHaveTextContent("Lanzada")
  })
})

describe("bloqueo de bases en el diálogo de lanzamiento", () => {
  it("una base aplicada no se puede elegir en modo completo y dice cómo seguir; revertida y bypass sí", () => {
    expect(bloqueo(base(1, "aplicada"), "completo")).toBe("Ya tiene QMS-TR aplicado: revírtela primero")
    expect(bloqueo(base(1, "aplicada"), "solo_correr")).toBeNull()
    expect(bloqueo(base(2, "revertida"), "completo")).toBeNull()
    expect(bloqueo(base(4, "bypass"), "completo")).toBeNull()
    expect(bloqueo(base(3, "pendiente"), "completo")).toBeNull()
  })
})

describe("TableroBases", () => {
  it("una celda por base, KPIs y la leyenda filtra", async () => {
    const onFiltro = vi.fn()
    const bases = [base(1, "aplicada"), base(2, "aplicada"), base(3, "retenida", { h4: null }), base(4, "en_proceso", { tanda_estado: "corriendo" })]
    render(<TableroBases pais="Ecuador" periodo="202609" bases={bases} filtro={null} onFiltro={onFiltro} onSeleccionar={vi.fn()} />)
    expect(screen.getAllByTestId(/^qf-celda-/)).toHaveLength(4)
    expect(screen.getByTestId("qf-kpi-h4")).toHaveTextContent("3/ 4")
    expect(screen.getByTestId("qf-kpi-aplicadas")).toHaveTextContent("2")
    await userEvent.click(screen.getByRole("button", { name: /Retenidas/ }))
    expect(onFiltro).toHaveBeenCalledWith("retenida")
  })
  it("con PythonCac el KPI es de bases con distribución de actos (hito 3) y no hay retenidas por hito 4", () => {
    const bases = [base(1, "pendiente", { h4: null }), base(2, "sin_hito4", { h3: null, h4: null })]
    render(<TableroBases pais="Chile" periodo="202609" bases={bases} filtro={null} onFiltro={vi.fn()} onSeleccionar={vi.fn()} entrega="pythoncac" />)
    expect(screen.getByTestId("qf-kpi-h3")).toHaveTextContent("1/ 2")
    expect(screen.queryByTestId("qf-kpi-h4")).toBeNull()
    expect(screen.getByTestId("qf-kpi-sin-distribucion")).toHaveTextContent("1")
    expect(screen.getByTestId("qf-leyenda")).toHaveTextContent("Sin distribución de actos")
  })
})

describe("TableroBases: celdas", () => {
  it("cada celda abre el detalle de su base y las que están en QMS-TR laten (salvo apagadas por el filtro)", async () => {
    const onSeleccionar = vi.fn()
    const bases = [base(1, "aplicada"), base(4, "en_proceso", { tanda_estado: "en_revision" })]
    const { rerender } = render(<TableroBases pais="Chile" periodo="202609" bases={bases} filtro={null} onFiltro={vi.fn()} onSeleccionar={onSeleccionar} />)
    const celda = screen.getByTestId("qf-celda-4")
    expect(celda).toHaveClass("qf-latido")
    expect(celda).toHaveAccessibleName(/En revisión/)
    expect(screen.getByTestId("qf-celda-1")).not.toHaveClass("qf-latido")
    await userEvent.click(celda)
    expect(onSeleccionar).toHaveBeenCalledWith(bases[1])
    rerender(<TableroBases pais="Chile" periodo="202609" bases={bases} filtro="aplicada" onFiltro={vi.fn()} onSeleccionar={onSeleccionar} />)
    expect(screen.getByTestId("qf-celda-4")).not.toHaveClass("qf-latido")
  })
})

describe("TableroBases sin hito 4 en el período", () => {
  it("muestra esperando liberación en vez de retenidas", () => {
    const bases = [base(1, "esperando_liberacion", { h4: null }), base(2, "esperando_liberacion", { h4: null })]
    render(<TableroBases pais="Bolivia" periodo="202610" bases={bases} filtro={null} onFiltro={vi.fn()} onSeleccionar={vi.fn()} />)
    expect(screen.getByTestId("qf-kpi-esperando-liberacion")).toHaveTextContent("2")
    expect(screen.queryByTestId("qf-kpi-retenidas")).toBeNull()
  })
})

describe("avisos en Jira", () => {
  const aviso = (extra = {}) => ({
    id: "a1", tanda_id: "t1", pais: "EC", periodo: "202609", tipo: "pase_mtr" as const, jira_key: "SIM-1",
    texto: "QMS-TR quedó aplicado y verificado en J.",
    destinatarios: [{ account_id: "712020:abc", nombre: "Alejandro Peña" }],
    publicado: false, modo: "simulacion" as const, at: "2026-10-08T15:00:00Z", ...extra,
  })

  it("un aviso simulado no enlaza al ticket y dice que no se publicó; uno real enlaza a Jira", async () => {
    const { BandejaAvisos } = await import("../BandejaAvisos")
    render(<BandejaAvisos avisos={[aviso(), aviso({ id: "a2", tipo: "observadores", jira_key: "LAT-4101", publicado: true, modo: "real" })]} tandas={[]} />)
    const simulado = screen.getByTestId("qf-aviso-pase_mtr")
    expect(simulado).toHaveTextContent("Simulado, no se publicó")
    expect(simulado).toHaveTextContent("@Alejandro Peña")
    expect(simulado.querySelector("a")).toBeNull()
    const real = screen.getByTestId("qf-aviso-observadores")
    expect(real).toHaveTextContent("Publicado en Jira")
    expect(real.querySelector("a")).toHaveAttribute("href", "https://requestmanager.atlassian.net/browse/LAT-4101")
  })

  it("sin nombre ni ticket muestra el accountId abreviado y no inventa el enlace", async () => {
    const { BandejaAvisos } = await import("../BandejaAvisos")
    render(<BandejaAvisos avisos={[aviso({ jira_key: null, destinatarios: [{ account_id: "712020:0ce95529-7fe5-44d3", nombre: null }] })]} tandas={[]} />)
    expect(screen.getByTestId("qf-aviso-pase_mtr")).toHaveTextContent("@712020:0ce95529…")
    expect(screen.queryByTestId("qf-aviso-ticket")).toBeNull()
  })

  it("sin avisos muestra el estado vacío", async () => {
    const { BandejaAvisos } = await import("../BandejaAvisos")
    render(<BandejaAvisos avisos={[]} tandas={[]} />)
    expect(screen.getByText("Todavía no hay avisos en este período")).toBeInTheDocument()
  })
})

describe("TablaBases: motivo del bypass y bases a revisar", () => {
  it("muestra por qué la base quedó sin ajustes y marca la que hay que revisar", async () => {
    const { TablaBases } = await import("../TablaBases")
    const motivo = "equivalencia de volumen MWP atípica (factor PV→MWP ×10 o más …): no se corrige"
    const revisar = "volumen país al tope del motor y fuera de su caja histórica: revisar el dato"
    render(<TablaBases filtro={null} onFiltro={() => {}} bases={[
      base(201, "bypass", { motivo_bypass: motivo }),
      base(252, "en_proceso", { revisar }),
      base(250, "en_proceso"),
    ]} />)
    expect(screen.getByTestId("qf-motivo-bypass")).toHaveTextContent(motivo)
    const chips = screen.getAllByTestId("qf-revisar")
    expect(chips).toHaveLength(1)
    expect(chips[0]).toHaveAttribute("title", revisar)
    expect(screen.getAllByText("Sin ajustes de QMS-TR").length).toBeGreaterThan(0)
  })
})

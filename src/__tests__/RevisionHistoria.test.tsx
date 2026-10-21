import { describe, it, expect } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CeldasUniverso, RevisionHistoria } from "@/modules/iteracion/components/RevisionPesaje"
import type { CeldaUniverso, GrupoCeldas, IndicadorRevision } from "@/modules/iteracion/types"

const serie = ["202509", "202510", "202511", "202512"].map((periodo, k) => ({ periodo, valor: 46 + k }))
const IND: IndicadorRevision[] = [
  { id: "eficiencia", etiqueta: "Eficiencia de los pesos", formato: "pct1", valor: 55.1, mes_anterior: 49,
    min12: 46, max12: 49, media12: 47.5, serie, estado: "aviso", regla: "Fuera del mínimo–máximo de los últimos 12 meses" },
  { id: "juntas", etiqueta: "Juntas de celdas", formato: "num", valor: 0, mes_anterior: null, serie: [],
    estado: "neutro", regla: "Sin historia todavía: se guarda desde esta corrida" },
]

describe("revisión contra la historia", () => {
  it("al hacer clic en un indicador abre su detalle con qué mide, sus cifras y cada mes", async () => {
    render(<RevisionHistoria indicadores={IND} />)
    await userEvent.click(screen.getByTestId("it-rev-eficiencia"))
    const d = await screen.findByTestId("it-rev-detalle")
    expect(within(d).getByText(/Eficiencia de Kish/)).toBeInTheDocument()
    expect(within(d).getByText("Fuera de rango")).toBeInTheDocument()
    // +16 % contra la media de 47,5
    expect(within(d).getAllByText("+16 % esta corrida")).toHaveLength(1)
    expect(within(d).getByText("dic 25")).toBeInTheDocument()
  })

  it("sin historia muestra solo qué mide y la regla; también se abre con Enter", async () => {
    render(<RevisionHistoria indicadores={IND} />)
    screen.getByTestId("it-rev-juntas").focus()
    await userEvent.keyboard("{Enter}")
    const d = await screen.findByTestId("it-rev-detalle")
    expect(within(d).getByText(/se juntaron con otras/)).toBeInTheDocument()
    expect(within(d).getByText(/Sin historia todavía/)).toBeInTheDocument()
  })
})

const celda = (uig: number, categoria: string, alerta: boolean): CeldaUniverso => ({
  uig, nivel: 1, categoria, padre: null, hogares: 4, hogares_12m: 4, universo: 1000, peso_total: 1000,
  dif_universo: 0, peso_medio: 250, peso_medio_12m: 240, limite_inf: 10, limite_sup: 900, peso_min: 100,
  peso_max: 400, peso_medio_publicado: null, junta: null, estado: alerta ? "aviso" : "ok",
  motivos: alerta ? ["Menos de 5 hogares"] : [],
})
const GRUPOS: GrupoCeldas[] = [
  { id: "nse", nombre: "Nivel Socioeconómico N1", celdas: [celda(1, "AB", true), celda(2, "C", false)] },
  { id: "tam", nombre: "Tamaño Familia N2", celdas: [celda(3, "5 o más", true)] },
]

describe("celdas del Universo", () => {
  it("sin grupo elegido muestra las alertas de todos; elegir y volver a presionar quita el filtro", async () => {
    render(<CeldasUniverso grupos={GRUPOS} />)
    expect(screen.getByTestId("it-celda-1")).toHaveTextContent("Nivel Socioeconómico N1")
    expect(screen.getByTestId("it-celda-3")).toBeInTheDocument()
    expect(screen.queryByTestId("it-celda-2")).not.toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("2 de 3 celdas · todos los grupos")

    await userEvent.click(screen.getByTestId("it-grupo-tam"))
    expect(screen.queryByTestId("it-celda-1")).not.toBeInTheDocument()
    expect(screen.getByTestId("it-grupo-tam")).toHaveAttribute("aria-pressed", "true")

    await userEvent.click(screen.getByTestId("it-grupo-tam"))
    expect(screen.getByTestId("it-grupo-tam")).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByTestId("it-celda-1")).toBeInTheDocument()
  })
})

import { describe, it, expect } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RevisionHistoria } from "@/modules/iteracion/components/RevisionPesaje"
import type { IndicadorRevision } from "@/modules/iteracion/types"

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

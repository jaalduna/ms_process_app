import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { ResultadoElegibilidadView } from "@/modules/iteracion/components/ResultadoElegibilidad"
import type { RegionElegibilidad, ResultadoElegibilidad } from "@/modules/iteracion/types"

const region = (id: string, nombre: string, cumplimiento: number, estado: RegionElegibilidad["estado"]): RegionElegibilidad => ({
  id, nombre, ideal: 100, natural: 80, imputados: 10, final: Math.round(cumplimiento * 100), cumplimiento, estado,
})

const resultado: ResultadoElegibilidad = {
  tipo: "elegibilidad",
  f_ok: 1.1,
  regiones: [
    region("A", "Amazonas", 1.02, "ok"),
    region("B", "Bahía", 0.93, "justo"),
    region("C", "Ceará", 0.71, "deficit"),
    region("D", "Distrito", 1.05, "ok"),
    region("E", "Espírito", 0.85, "deficit"),
  ],
  revision: { hogares_imputar: 50, regiones_con_imputacion: 3 },
  tendencia: [],
  comparaciones: [],
  donantes: [],
}

const ver = () => render(<ResultadoElegibilidadView resultado={resultado} ajustes={{ regiones_cerradas: [] }} onAjustes={() => {}} />)
const nombres = () => within(screen.getByTestId("it-regiones")).getAllByRole("listitem").map((li) => li.dataset.testid)

describe("regiones de Elegibilidad", () => {
  it("por defecto muestra solo las que requieren atención, de peor a mejor, y pliega las OK", () => {
    ver()
    expect(nombres()).toEqual(["it-region-C", "it-region-E", "it-region-B"])
    expect(screen.getByTestId("it-regiones-ok")).toHaveTextContent("y 2 regiones OK")
  })

  it("el resumen por estado filtra y «ver» despliega las OK", async () => {
    ver()
    await userEvent.click(screen.getByTestId("it-filtro-deficit"))
    expect(nombres()).toEqual(["it-region-C", "it-region-E"])
    await userEvent.click(screen.getByTestId("it-filtro-deficit"))
    await userEvent.click(screen.getByTestId("it-regiones-ok"))
    expect(nombres()).toHaveLength(5)
    expect(screen.queryByTestId("it-regiones-ok")).not.toBeInTheDocument()
  })

  it("la búsqueda encuentra también regiones OK plegadas", async () => {
    ver()
    await userEvent.type(screen.getByLabelText("Buscar región"), "distr")
    expect(nombres()).toEqual(["it-region-D"])
  })

  it("el detalle de la región se abre al hacer clic en su nombre", async () => {
    ver()
    const fila = screen.getByTestId("it-region-C")
    expect(within(fila).queryByText("Ideal")).not.toBeInTheDocument()
    await userEvent.click(within(fila).getByRole("button", { name: "Ceará" }))
    expect(within(fila).getByText("Ideal")).toBeInTheDocument()
  })
})

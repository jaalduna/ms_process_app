import { describe, it, expect, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ParametrosPanel } from "@/modules/iteracion/components/ParametrosPanel"
import type { ParamDef } from "@/modules/iteracion/types"

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))

const DEFS: ParamDef[] = [
  { clave: "f_ok", etiqueta: "Llenado para celda OK", ayuda: "Celdas que ya llegan no reciben imputados", tipo: "rango", min: 0.8, max: 1.5, paso: 0.05, formato: "pct", grupo: "Llenado de celdas" },
  { clave: "n_rep_strict", etiqueta: "Usos máx. por donante", ayuda: "Repeticiones", tipo: "entero", min: 1, max: 12, paso: 1, formato: "num", grupo: "Donantes" },
  { clave: "ascend2", etiqueta: "Menos espacio primero", ayuda: "Orden", tipo: "booleano", grupo: "Donantes" },
  { clave: "METODO_BOUNDS", etiqueta: "Método de los límites", ayuda: "Cómo", tipo: "opcion", grupo: "Límites",
    opciones: [{ valor: "percentile", etiqueta: "Percentiles" }, { valor: "iqr", etiqueta: "Intercuartil" }] },
]
const PAIS = { f_ok: 1.1, n_rep_strict: 5, ascend2: false, METODO_BOUNDS: "percentile" }

function ver(valores = PAIS) {
  const onChange = vi.fn()
  render(<ParametrosPanel definiciones={DEFS} valores={valores} referencia={PAIS} onChange={onChange} />)
  return onChange
}

describe("panel de parámetros", () => {
  it("agrupa en acordeón: abre el primero y los que traen cambios", async () => {
    ver({ ...PAIS, METODO_BOUNDS: "iqr" })
    expect(screen.getByTestId("it-param-grupo-0")).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByTestId("it-param-grupo-1")).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByTestId("it-fila-n_rep_strict")).not.toBeInTheDocument()
    expect(screen.getByTestId("it-param-grupo-2")).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByTestId("it-param-grupo-2")).toHaveTextContent("1 cambiado")
    await userEvent.click(screen.getByTestId("it-param-grupo-1"))
    expect(screen.getByTestId("it-fila-n_rep_strict")).toBeInTheDocument()
    // sin texto de ayuda visible por defecto
    expect(screen.queryByText("Repeticiones")).not.toBeInTheDocument()
  })

  it("la ayuda sale al enfocar la ⓘ con teclado: explicación, clave, rango y valor del país", async () => {
    ver({ ...PAIS, f_ok: 1.2 })
    await userEvent.tab()
    await userEvent.tab()
    expect(screen.getByTestId("it-param-ayuda-f_ok")).toHaveFocus()
    const tip = await screen.findByRole("tooltip")
    expect(tip).toHaveTextContent("Celdas que ya llegan no reciben imputados")
    expect(tip).toHaveTextContent("f_ok")
    expect(tip).toHaveTextContent("Rango: 80% a 150%")
    expect(tip).toHaveTextContent("País: 110% · ahora 120%")
  })

  it("controles compactos: ± por paso en %, escribir el valor y elegir opción", async () => {
    const onChange = ver()
    const fila = screen.getByTestId("it-fila-f_ok")
    expect(within(fila).getByRole("textbox")).toHaveValue("110")
    await userEvent.click(within(fila).getByRole("button", { name: "Subir Llenado para celda OK" }))
    expect(onChange).toHaveBeenLastCalledWith("f_ok", 1.15)
    await userEvent.clear(within(fila).getByRole("textbox"))
    await userEvent.type(within(fila).getByRole("textbox"), "93{Enter}")
    // al paso más cercano: 95 %
    expect(onChange).toHaveBeenLastCalledWith("f_ok", 0.95)
    await userEvent.click(screen.getByTestId("it-param-grupo-2"))
    await userEvent.selectOptions(screen.getByLabelText("Método de los límites"), "iqr")
    expect(onChange).toHaveBeenLastCalledWith("METODO_BOUNDS", "iqr")
  })
})

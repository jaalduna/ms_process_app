import { describe, it, expect, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { TargetsSegmento } from "@/modules/iteracion/components/TargetsSegmento"
import type { AjustesElegibilidad, Estructura } from "@/modules/iteracion/types"

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

const EST: Estructura = {
  bloques: [
    {
      secuencia: 0, nombre: "NSE", variable: "NSE_LOC", total: 80, categorias: ["AB", "C"],
      regiones: [
        { secuencia: 1, id: "16", nombre: "NORTE", total: 30, celdas: [
          { secuencia: 2, categoria: "AB", ideal: 10 }, { secuencia: 3, categoria: "C", ideal: 20 }] },
        { secuencia: 4, id: "4", nombre: "SUR", total: 50, celdas: [
          { secuencia: 5, categoria: "AB", ideal: 15 }, { secuencia: 6, categoria: "C", ideal: 35 }] },
      ],
    },
    {
      secuencia: 7, nombre: "EDAC", variable: "EDAC", total: 80, categorias: ["-39", "40+"],
      regiones: [
        { secuencia: 8, id: "16", nombre: "Norte", total: 30, celdas: [
          { secuencia: 9, categoria: "-39", ideal: 12 }, { secuencia: 10, categoria: "40+", ideal: 18 }] },
        { secuencia: 11, id: "4", nombre: "SUR", total: 50, celdas: [
          { secuencia: 12, categoria: "-39", ideal: 20 }, { secuencia: 13, categoria: "40+", ideal: 30 }] },
      ],
    },
  ],
}

function ver() {
  const visto: AjustesElegibilidad[] = []
  function Envoltura() {
    const [a, setA] = useState<AjustesElegibilidad>({ regiones_cerradas: ["9"], muestra_ideal: {} })
    return (
      <TargetsSegmento
        estructura={EST}
        ajustes={a}
        onAjustes={(n) => {
          visto.push(n)
          setA(n)
        }}
        celdas={[{ secuencia: "2", natural: 6, imputados: 3 }]}
      />
    )
  }
  render(<Envoltura />)
  return visto
}

const ultimo = (v: AjustesElegibilidad[]) => v[v.length - 1]

describe("targets por segmento", () => {
  it("editar un target lo deja como cambio, avisa el descuadre e «Igualar» lo resuelve", async () => {
    const visto = ver()
    await userEvent.click(screen.getByTestId("it-targets-abrir"))
    const ab = screen.getByLabelText("NORTE · AB")
    // lo logrado en el último cálculo: 6 + 3 = 9 de 10
    expect(within(ab.parentElement!).getByText("9 · 90%")).toBeInTheDocument()
    await userEvent.clear(ab)
    await userEvent.type(ab, "20{Enter}")
    expect(ultimo(visto)).toEqual({ regiones_cerradas: ["9"], muestra_ideal: { "2": 20 } })
    expect(screen.getByTestId("it-targets-descuadre")).toHaveTextContent("NORTE (NSE 40 · EDAC 30)")
    await userEvent.click(screen.getByTestId("it-targets-igualar-16"))
    expect(ultimo(visto).muestra_ideal).toEqual({ "2": 20, "9": 16, "10": 24 })
    expect(screen.queryByTestId("it-targets-descuadre")).not.toBeInTheDocument()
    expect(screen.getByTestId("it-targets-cambios")).toHaveTextContent("3 cambios")
  })

  it("el total de la región reparte en todos los bloques", async () => {
    const visto = ver()
    await userEvent.click(screen.getByTestId("it-targets-abrir"))
    const total = screen.getByLabelText("Total SUR")
    await userEvent.clear(total)
    await userEvent.type(total, "60{Enter}")
    expect(ultimo(visto).muestra_ideal).toEqual({ "5": 18, "6": 42, "12": 24, "13": 36 })
  })

  it("pega un bloque copiado de Excel desde la celda elegida", async () => {
    const visto = ver()
    await userEvent.click(screen.getByTestId("it-targets-abrir"))
    fireEvent.paste(screen.getByLabelText("NORTE · AB"), {
      clipboardData: { getData: () => "11\t19\n16\t34\n" },
    })
    expect(ultimo(visto).muestra_ideal).toEqual({ "2": 11, "3": 19, "5": 16, "6": 34 })
    // las regiones siguen sumando 30 y 50: no hay descuadre
    expect(screen.queryByTestId("it-targets-descuadre")).not.toBeInTheDocument()
  })
})

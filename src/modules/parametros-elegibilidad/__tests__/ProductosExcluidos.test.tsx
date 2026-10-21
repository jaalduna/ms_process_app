import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cambiosExclusiones, separarExclusiones, unirExclusiones } from "../exclusiones"

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))
const h = vi.hoisted(() => ({ getParamsTable: vi.fn(), publishParams: vi.fn() }))
vi.mock("../api", () => h)

import { ProductosExcluidos } from "../components/ProductosExcluidos"

// Brasil: 343 no cuenta para elegibilidad; 70 y 71 no se imputan
const TABLAS: Record<string, { rows: object[] }> = {
  Criterios_Elegibilidad_ExCateg: { rows: [{ ExCateg: "A", IdProduto: 343 }] },
  Imputacion_ExCateg: { rows: [{ IdProduto: 70 }, { IdProduto: 71 }] },
}

beforeEach(() => {
  vi.clearAllMocks()
  h.getParamsTable.mockImplementation((t: string) => Promise.resolve({ ...TABLAS[t], country: "BR", table: t, updated_at: null, updated_by: null }))
  h.publishParams.mockResolvedValue({})
})

function ver() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onPublicado = vi.fn()
  render(
    <QueryClientProvider client={qc}>
      <ProductosExcluidos codigo="BR" productos={[{ id: 343, nombre: "Pañales" }, { id: 70, nombre: "Cerveza" }, { id: 900, nombre: "Café" }]} onPublicado={onPublicado} />
    </QueryClientProvider>,
  )
  return onPublicado
}

describe("productos excluidos", () => {
  it("une y separa las dos tablas sin perder nada", () => {
    const f = unirExclusiones([{ ExCateg: "A", IdProduto: 7 }], [{ IdProduto: 7 }, { IdProduto: 3 }])
    expect(f).toEqual([{ id: 3, elegibilidad: false, imputacion: true }, { id: 7, elegibilidad: true, imputacion: true }])
    expect(separarExclusiones(f)).toEqual({ criterios: [{ ExCateg: "A", IdProduto: 7 }], imputacion: [{ IdProduto: 3 }, { IdProduto: 7 }] })
    expect(cambiosExclusiones(f, [{ id: 7, elegibilidad: false, imputacion: true }]).imputacion.quita).toEqual([3])
  })

  it("una sola lista con nombres; agregar por nombre y publicar escribe solo las tablas que cambian", async () => {
    const onPublicado = ver()
    const fila = await screen.findByTestId("prod-excluido-343")
    expect(within(fila).getByText("Pañales")).toBeInTheDocument()
    expect(within(fila).getByLabelText("343 no cuenta para elegibilidad")).toBeChecked()
    expect(within(fila).getByLabelText("343 no se imputa")).not.toBeChecked()

    // agregar «Café» por nombre: parte excluido de las dos; se deja solo en imputación
    await userEvent.type(screen.getByTestId("prod-excluidos-agregar"), "caf")
    await userEvent.click(screen.getByRole("button", { name: /Café/ }))
    await userEvent.click(within(screen.getByTestId("prod-excluido-900")).getByLabelText("900 no cuenta para elegibilidad"))

    await userEvent.click(screen.getByTestId("prod-excluidos-revisar"))
    expect(screen.getByTestId("prod-excluidos-resumen")).toHaveTextContent("Dejan de imputarse: 900 (Café)")
    await userEvent.click(screen.getByTestId("prod-excluidos-publicar"))

    expect(h.publishParams).toHaveBeenCalledTimes(1)
    expect(h.publishParams).toHaveBeenCalledWith("Imputacion_ExCateg", "BR", [{ IdProduto: 70 }, { IdProduto: 71 }, { IdProduto: 900 }])
    expect(onPublicado).toHaveBeenCalled()
  })

  it("con más de un grupo de excepción no edita y manda al editor completo", async () => {
    TABLAS.Criterios_Elegibilidad_ExCateg = { rows: [{ ExCateg: "A", IdProduto: 1 }, { ExCateg: "B", IdProduto: 2 }] }
    ver()
    expect(await screen.findByRole("alert")).toHaveTextContent("más de un grupo de excepción (A, B)")
    TABLAS.Criterios_Elegibilidad_ExCateg = { rows: [{ ExCateg: "A", IdProduto: 343 }] }
  })
})

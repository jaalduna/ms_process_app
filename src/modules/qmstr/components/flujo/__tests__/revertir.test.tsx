import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { BloqueoReversion, Tanda } from "../../../types"

const bloqueo: BloqueoReversion = {
  actos: 1389, cambios: 1400, motivos: { "6": 1400 }, columnas: { FACTOR_RW1: 1400 },
  usuarios: ["WP\\ruann.fonsecadasilva"], desde: "2026-10-13T15:00:00", hasta: "2026-10-14T09:00:00",
}

let estado: { data?: Record<string, BloqueoReversion>; isPending: boolean; isSuccess: boolean; isError: boolean; error: unknown }

vi.mock("../../../hooks/useQmsTrFlujo", () => ({ useBloqueosReversion: () => estado }))

const tanda = { id: "t1", numero: 4, productos: [200, 201], bypass: [] } as unknown as Tanda

async function abrir(onRevertir = vi.fn()) {
  const { RevertirDialog } = await import("../RevertirDialog")
  render(<RevertirDialog tanda={tanda} yaRevertidas={new Set()} nombres={new Map([[200, "Base 200"], [201, "Base 201"]])}
    revirtiendo={false} onOpenChange={() => {}} onRevertir={onRevertir} />)
  return onRevertir
}

describe("RevertirDialog: bases con cambios posteriores a QMS-TR", () => {
  beforeEach(() => {
    estado = { data: { "200": bloqueo }, isPending: false, isSuccess: true, isError: false, error: null }
  })

  it("avisa los cambios posteriores y exige confirmar que se pierden", async () => {
    const user = userEvent.setup()
    const onRevertir = await abrir()
    expect(screen.getByTestId("qf-revertir-aviso-bloqueo")).toHaveTextContent("Una base tuvo cambios en J después de QMS-TR")
    expect(screen.getByTestId("qf-revertir-bloqueo-200")).toHaveTextContent(
      "1389 actos cambiados en J después de QMS-TR · motivo 6 (1400) · por ruann.fonsecadasilva · 13/10–14/10: se pierden si la reviertes",
    )
    expect(screen.getByTestId("qf-revertir-base-200")).toBeEnabled()

    await user.click(screen.getByTestId("qf-revertir-base-200"))
    await user.click(screen.getByTestId("qf-revertir-base-201"))
    await user.type(screen.getByTestId("qf-revertir-motivo"), "Pedido DC")
    await user.click(screen.getByTestId("qf-revertir-revisar"))
    expect(screen.getByTestId("qf-revertir-pisar")).toHaveTextContent("se van a deshacer 1.400 cambios")
    expect(screen.getByTestId("qf-revertir-confirmar")).toBeDisabled()
    await user.click(screen.getByTestId("qf-revertir-aceptar-pisar"))
    await user.click(screen.getByTestId("qf-revertir-confirmar"))
    expect(onRevertir).toHaveBeenCalledWith([200, 201], "Pedido DC", true)
  })

  it("sin cambios posteriores en lo elegido no pide confirmar nada extra", async () => {
    const user = userEvent.setup()
    const onRevertir = await abrir()
    await user.click(screen.getByTestId("qf-revertir-base-201"))
    await user.type(screen.getByTestId("qf-revertir-motivo"), "Pedido DC")
    await user.click(screen.getByTestId("qf-revertir-revisar"))
    expect(screen.queryByTestId("qf-revertir-pisar")).not.toBeInTheDocument()
    await user.click(screen.getByTestId("qf-revertir-confirmar"))
    expect(onRevertir).toHaveBeenCalledWith([201], "Pedido DC", false)
  })

  it("sin la revisión de la auditoría no se puede elegir ninguna base", async () => {
    estado = { data: undefined, isPending: false, isSuccess: false, isError: true, error: new Error("SQL no configurado") }
    await abrir()
    expect(screen.getByTestId("qf-revertir-error-bloqueos")).toHaveTextContent("Sin esa revisión no se puede revertir")
    expect(screen.getByTestId("qf-revertir-base-200")).toBeDisabled()
    expect(screen.getByTestId("qf-revertir-base-201")).toBeDisabled()
    expect(screen.getByTestId("qf-revertir-revisar")).toBeDisabled()
  })

  it("mientras revisa, avisa y no deja elegir", async () => {
    estado = { data: undefined, isPending: true, isSuccess: false, isError: false, error: null }
    await abrir()
    expect(screen.getByTestId("qf-revertir-revisando")).toBeInTheDocument()
    expect(screen.getByTestId("qf-revertir-base-201")).toBeDisabled()
  })
})

describe("caminoDe: entrega directa con PythonCac", () => {
  it("sin ticket, DQ, hito 10 ni aviso a MTR", async () => {
    const { caminoDe } = await import("../../../types")
    expect(caminoDe({ tipo: "manual", modo: "completo" }, "pythoncac")).toEqual(["detectada", "corriendo", "validando", "aplicando", "cerrada"])
    expect(caminoDe({ tipo: "reversion", modo: "completo" }, "pythoncac")).toEqual(["detectada", "aplicando", "cerrada"])
    expect(caminoDe({ tipo: "manual", modo: "completo" })).toContain("en_dq")
  })
})

describe("RevertirDialog: revertir solo una base desde su detalle", () => {
  beforeEach(() => {
    estado = { data: {}, isPending: false, isSuccess: true, isError: false, error: null }
  })

  it("trae la base elegida y no muestra las demás de la tanda", async () => {
    const user = userEvent.setup()
    const onRevertir = vi.fn()
    const { RevertirDialog } = await import("../RevertirDialog")
    render(<RevertirDialog tanda={tanda} soloBase={201} yaRevertidas={new Set()} nombres={new Map([[200, "Base 200"], [201, "Base 201"]])}
      revirtiendo={false} onOpenChange={() => {}} onRevertir={onRevertir} />)
    expect(screen.queryByTestId("qf-revertir-base-200")).toBeNull()
    expect(screen.getByTestId("qf-revertir-base-201")).toBeChecked()
    await user.type(screen.getByTestId("qf-revertir-motivo"), "Pedido DC")
    await user.click(screen.getByTestId("qf-revertir-revisar"))
    await user.click(screen.getByTestId("qf-revertir-confirmar"))
    expect(onRevertir).toHaveBeenCalledWith([201], "Pedido DC", false)
  })
})

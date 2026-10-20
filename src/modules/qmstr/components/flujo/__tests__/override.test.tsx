import { describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { FlujoBase } from "../../../types"

const base = (producto: number, estado: FlujoBase["estado"], extra: Partial<FlujoBase> = {}): FlujoBase => ({
  producto, nombre: `Base ${producto}`, h3: "2026-09-26T10:00:00-03:00", h4: "2026-10-01T09:00:00-03:00", h4_anulado: false,
  h10: null, fuera_de_alcance: false, estado, tanda_id: null, tanda_numero: null, tanda_estado: null, jira_key: null, motivo_bypass: null, revisar: null,
  historial: [], ...extra,
})

vi.mock("../../../hooks/useQmsTrFlujo", () => ({
  useFlujoPeriodos: () => ({ data: [{ periodo: "202609", h3: 3, h4: 3, h10: 0, tandas: 0 }], isLoading: false, error: null }),
  useFlujoBases: () => ({ data: [base(445, "pendiente"), base(446, "pendiente"), base(448, "pendiente"), base(450, "retenida", { h4: null })], isLoading: false, error: null }),
}))

describe("OverrideDialog: filtro de bases elegidas y excluidas", () => {
  it("excluidas = liberadas no elegidas (no las que no se pueden elegir) y van en la confirmación", async () => {
    const { OverrideDialog } = await import("../OverrideDialog")
    const user = userEvent.setup()
    render(<OverrideDialog open onOpenChange={() => {}} paises={[{ codigo: "CL", nombre: "chile", etiqueta: "Chile" }]}
      paisInicial="CL" periodoInicial="202609" lanzando={false} onLanzar={() => {}} />)

    await user.click(screen.getByTestId("qf-override-liberadas"))
    await user.click(screen.getByTestId("qf-override-base-448"))
    expect(screen.getByTestId("qf-override-vista-fuera")).toHaveTextContent("1")

    await user.click(screen.getByTestId("qf-override-vista-fuera"))
    const lista = screen.getByTestId("qf-override-bases")
    expect(within(lista).getByText("Base 448")).toBeInTheDocument()
    expect(within(lista).queryByText("Base 445")).not.toBeInTheDocument()
    expect(within(lista).queryByText("Base 450")).not.toBeInTheDocument()

    await user.click(screen.getByTestId("qf-override-vista-elegidas"))
    expect(within(lista).queryByText("Base 448")).not.toBeInTheDocument()
    expect(within(lista).getByText("Base 446")).toBeInTheDocument()

    await user.click(screen.getByTestId("qf-override-revisar"))
    expect(screen.getByTestId("qf-override-resumen-fuera")).toHaveTextContent("Base 448")
  })

  it("con PythonCac no exige hito 4 ni forzar: muestra la distribución de actos (hito 3)", async () => {
    const { OverrideDialog } = await import("../OverrideDialog")
    const user = userEvent.setup()
    const onLanzar = vi.fn()
    render(<OverrideDialog open onOpenChange={() => {}} paises={[{ codigo: "CL", nombre: "chile", etiqueta: "Chile" }]}
      paisInicial="CL" periodoInicial="202609" lanzando={false} onLanzar={onLanzar} entrega="pythoncac" />)

    expect(screen.getByTestId("qf-override-bases")).not.toHaveTextContent("hito 4")
    expect(screen.getByTestId("qf-override-bases")).toHaveTextContent("Distribución")
    await user.click(screen.getByTestId("qf-override-base-450"))
    expect(screen.queryByTestId("qf-override-forzar")).not.toBeInTheDocument()
    expect(screen.queryByTestId("qf-override-advertencia")).not.toBeInTheDocument()
    expect(screen.getByTestId("qf-override-revisar")).toBeEnabled()
  })
})

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { CalibrateButton } from "../CalibrateButton"
import { getPermissions } from "@/lib/permissions"
import type { CalibrationConfig } from "../../types"

const config: CalibrationConfig = {
  aggregations: { region: false, nivel_2: false },
  lookback_months: 12,
}

function renderButton(canTriggerByRole: boolean) {
  const startCalibration = vi.fn().mockResolvedValue(undefined)
  // El botón lista las versiones de J con useQuery (JAA-1119), así que necesita
  // un QueryClientProvider aunque la consulta no llegue a dispararse.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <CalibrateButton
        country="chile"
        countryLabel="Chile"
        period="202607"
        calibrationConfig={config}
        canTrigger
        canTriggerByRole={canTriggerByRole}
        isClosed={false}
        isPending={false}
        isRunning={false}
        startCalibration={startCalibration}
      />
    </QueryClientProvider>,
  )
  return { startCalibration }
}

describe("CalibrateButton — compuerta por rol", () => {
  it("el perfil Usuario ve el botón, pero deshabilitado", () => {
    renderButton(false)
    const btn = screen.getByRole("button", { name: "Calibrar" })
    expect(btn).toBeDisabled()
  })

  it("envuelve el botón deshabilitado en un disparador alcanzable", () => {
    renderButton(false)
    // Un <button disabled> no emite eventos de puntero: sin este envoltorio el
    // tooltip nunca podría abrirse. Se afirma el contrato estructural — que el
    // envoltorio existe y es enfocable — y no la apertura en sí, porque Radix
    // no llega a montar el contenido bajo jsdom (no implementa PointerEvent).
    // El texto del tooltip se verifica en navegador.
    const trigger = screen.getByRole("button", { name: "Calibrar" }).parentElement!
    expect(trigger.tagName).toBe("SPAN")
    expect(trigger).toHaveAttribute("tabindex", "0")
    expect(trigger).toHaveAttribute("data-slot", "tooltip-trigger")
  })

  it("sin permiso no monta el diálogo de confirmación", async () => {
    const user = userEvent.setup()
    const { startCalibration } = renderButton(false)
    await user.click(screen.getByRole("button", { name: "Calibrar" }))
    expect(screen.queryByText("Confirm Calibration")).not.toBeInTheDocument()
    expect(startCalibration).not.toHaveBeenCalled()
  })

  it("el perfil Admin sí puede abrir la confirmación", async () => {
    const user = userEvent.setup()
    renderButton(true)
    const btn = screen.getByRole("button", { name: "Calibrar" })
    expect(btn).toBeEnabled()
    await user.click(btn)
    expect(await screen.findByText("Confirm Calibration")).toBeInTheDocument()
  })
})

describe("getPermissions — quién puede ejecutar", () => {
  it("respeta los valores que emite Entra, con o sin mayúsculas", () => {
    expect(getPermissions(["Admin"]).canTriggerCalibration).toBe(true)
    expect(getPermissions(["admin"]).canTriggerCalibration).toBe(true)
    expect(getPermissions(["calibracion_specialist"]).canTriggerCalibration).toBe(true)
    expect(getPermissions(["Usuario"]).canTriggerCalibration).toBe(false)
    expect(getPermissions(["analyst"]).canTriggerCalibration).toBe(false)
    expect(getPermissions([]).canTriggerCalibration).toBe(false)
  })
})

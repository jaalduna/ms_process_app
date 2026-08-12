import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { ExecutionLaunchPanel } from "../ExecutionLaunchPanel"
import type { CountryInfo, JVersion } from "@/types/api"

vi.mock("@/lib/api", () => ({ getJVersions: vi.fn() }))
import { getJVersions } from "@/lib/api"

const COUNTRIES = [
  { code: "chile", queries: [], queries_count: 0, type: "country" },
  { code: "bolivia", queries: [], queries_count: 0, type: "country" },
] as unknown as CountryInfo[]

function version(country: string, tag: string, delta_version: number): JVersion {
  return {
    tag, country, period: "202607",
    table_fqn: `001-calibration-3-0.bronze_${country}.j_atoscompra_new`,
    delta_version, delta_timestamp: "2026-08-06T13:47:06.000Z",
    row_count: 1000, period_min: "202101", period_max: "202607",
    created_by: "backfill@wp.numerator.com", created_at: "2026-08-06T13:47:06.000Z",
  }
}

// chile tiene un tag que bolivia NO tiene (`_202606_v0`), y ambos comparten el
// nombre `_202607_v2` apuntando a versiones Delta distintas — igual que en los
// datos reales.
const BY_COUNTRY: Record<string, JVersion[]> = {
  chile: [
    version("chile", "_BKP_J_AtosCompra_New_RespaldoCalibracion_202607_v2", 12),
    version("chile", "_BKP_J_AtosCompra_New_RespaldoCalibracion_202606_v0", 4),
  ],
  bolivia: [version("bolivia", "_BKP_J_AtosCompra_New_RespaldoCalibracion_202607_v2", 26)],
}

function setup() {
  const onLaunch = vi.fn()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <ExecutionLaunchPanel
        countries={COUNTRIES}
        period="202607"
        launching={false}
        onLaunch={onLaunch}
      />
    </QueryClientProvider>,
  )
  return { onLaunch }
}

const pick = (name: string) => screen.getByRole("checkbox", { name: new RegExp(name) })

describe("ExecutionLaunchPanel · fuente de J", () => {
  beforeEach(() => {
    vi.mocked(getJVersions).mockImplementation(({ country }) =>
      Promise.resolve({ items: BY_COUNTRY[country] ?? [] }),
    )
  })

  it("sin país seleccionado no ofrece elegir versión", () => {
    setup()
    expect(screen.queryByLabelText("Usar una versión guardada")).not.toBeInTheDocument()
  })

  it("con varios países explica por qué no se puede elegir versión", async () => {
    setup()
    await userEvent.click(pick("Chile"))
    await userEvent.click(pick("Bolivia"))
    expect(screen.queryByLabelText("Usar una versión guardada")).not.toBeInTheDocument()
    expect(screen.getByText(/selecciona un solo país/i)).toBeInTheDocument()
  })

  it("con un país lanza con el tag elegido y sin sincronizar", async () => {
    const { onLaunch } = setup()
    await userEvent.click(pick("Chile"))
    await userEvent.click(await screen.findByLabelText("Usar una versión guardada"))

    await userEvent.click(screen.getByRole("button", { name: /Lanzar calibración/ }))
    await userEvent.click(screen.getByRole("button", { name: "Sí, lanzar" }))

    expect(onLaunch).toHaveBeenCalledWith(["chile"], {
      skip_sync: true,
      j_source: "_BKP_J_AtosCompra_New_RespaldoCalibracion_202607_v2",
    })
  })

  it("cambiar de país descarta el tag del país anterior", async () => {
    // Regresión: los tags son por país y `_202607_v2` existe en ambos apuntando
    // a versiones Delta distintas. Arrastrar el estado lanzaría contra una
    // versión que no es la que muestra la pantalla.
    const { onLaunch } = setup()
    await userEvent.click(pick("Chile"))
    await userEvent.click(await screen.findByLabelText("Usar una versión guardada"))
    // Un tag que solo existe en chile.
    await userEvent.click(screen.getByRole("button", { name: /RespaldoCalibracion/ }))
    await userEvent.click(await screen.findByRole("option", { name: /_202606_v0/ }))

    // Chile fuera, bolivia dentro.
    await userEvent.click(pick("Bolivia"))
    await userEvent.click(pick("Chile"))

    await waitFor(() =>
      expect(screen.getByLabelText("Sincronizar J desde SQL Server")).toBeChecked(),
    )

    await userEvent.click(screen.getByRole("button", { name: /Lanzar calibración/ }))
    await userEvent.click(screen.getByRole("button", { name: "Sí, lanzar" }))

    expect(onLaunch).toHaveBeenCalledWith(["bolivia"], {
      skip_sync: false,
      j_source: "sync",
    })
  })

  it("el diálogo dice que no se sincroniza cuando se usa una versión guardada", async () => {
    setup()
    await userEvent.click(pick("Chile"))
    await userEvent.click(await screen.findByLabelText("Usar una versión guardada"))
    await userEvent.click(screen.getByRole("button", { name: /Lanzar calibración/ }))
    expect(screen.getByText("No se sincroniza")).toBeInTheDocument()
  })
})

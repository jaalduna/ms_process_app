import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { JSourceSelector } from "../JSourceSelector"
import { versionSummary } from "../../lib/jVersions"
import { J_SOURCE_SYNC, type JVersion } from "@/types/api"

/** Versiones reales de `001-calibration-3-0.bronze_chile.j_atoscompra_new`. */
const VERSIONS: JVersion[] = [
  {
    tag: "_BKP_J_AtosCompra_New_RespaldoCalibracion_202607_v2",
    country: "chile", period: "202607",
    table_fqn: "001-calibration-3-0.bronze_chile.j_atoscompra_new",
    delta_version: 12, delta_timestamp: "2026-08-07T13:08:04.000Z",
    row_count: 14326866, period_min: "202101", period_max: "202607",
    created_by: "backfill@wp.numerator.com", created_at: "2026-08-07T13:08:04.000Z",
  },
  {
    tag: "_BKP_J_AtosCompra_New_RespaldoCalibracion_202607_v1",
    country: "chile", period: "202607",
    table_fqn: "001-calibration-3-0.bronze_chile.j_atoscompra_new",
    delta_version: 8, delta_timestamp: "2026-08-06T13:47:06.000Z",
    row_count: 14253458, period_min: "202101", period_max: "202607",
    created_by: "backfill@wp.numerator.com", created_at: "2026-08-06T13:47:06.000Z",
  },
  {
    tag: "_BKP_J_AtosCompra_New_RespaldoCalibracion_202606_v0",
    country: "chile", period: "202606",
    table_fqn: "001-calibration-3-0.bronze_chile.j_atoscompra_new",
    delta_version: 4, delta_timestamp: "2026-06-24T21:22:45.000Z",
    row_count: 14006426, period_min: "202101", period_max: "202606",
    created_by: "backfill@wp.numerator.com", created_at: "2026-06-24T21:22:45.000Z",
  },
]

function setup(props: Partial<React.ComponentProps<typeof JSourceSelector>> = {}) {
  const onChange = vi.fn()
  render(
    <JSourceSelector
      versions={VERSIONS}
      value={J_SOURCE_SYNC}
      onChange={onChange}
      {...props}
    />,
  )
  return { onChange }
}

describe("JSourceSelector", () => {
  it("arranca en sincronizar", () => {
    setup()
    expect(screen.getByLabelText("Sincronizar J desde SQL Server")).toBeChecked()
    expect(screen.getByLabelText("Usar una versión guardada")).not.toBeChecked()
  })

  it("muestra la fecha del último sync para no dar a entender que está al día", () => {
    setup({ lastSyncLabel: "05-08-2026" })
    expect(screen.getByText(/Último sync: 05-08-2026/)).toBeInTheDocument()
  })

  it("deshabilita la opción de versión guardada cuando no hay ninguna", () => {
    setup({ versions: [] })
    expect(screen.getByLabelText("Usar una versión guardada")).toBeDisabled()
    expect(
      screen.getByText("No hay versiones registradas para este país todavía."),
    ).toBeInTheDocument()
  })

  it("al elegir versión guardada preselecciona la más reciente", async () => {
    const { onChange } = setup()
    await userEvent.click(screen.getByLabelText("Usar una versión guardada"))
    expect(onChange).toHaveBeenCalledWith(VERSIONS[0].tag)
  })

  it("el desplegable filtra por texto", async () => {
    setup({ value: VERSIONS[0].tag })
    await userEvent.click(screen.getByRole("button", { name: /RespaldoCalibracion/ }))
    expect(screen.getAllByRole("option")).toHaveLength(3)

    // Por período: 202606 deja solo una.
    await userEvent.type(screen.getByLabelText("Buscar versión de J"), "202606")
    const filtered = screen.getAllByRole("option")
    expect(filtered).toHaveLength(1)
    expect(filtered[0]).toHaveTextContent("_202606_v0")
  })

  it("filtra también por sufijo de corrida", async () => {
    setup({ value: VERSIONS[0].tag })
    await userEvent.click(screen.getByRole("button", { name: /RespaldoCalibracion/ }))
    await userEvent.type(screen.getByLabelText("Buscar versión de J"), "_v1")
    expect(screen.getAllByRole("option")).toHaveLength(1)
  })

  it("avisa cuando la búsqueda no encuentra nada, en vez de mostrar una lista vacía", async () => {
    setup({ value: VERSIONS[0].tag })
    await userEvent.click(screen.getByRole("button", { name: /RespaldoCalibracion/ }))
    await userEvent.type(screen.getByLabelText("Buscar versión de J"), "209912")
    expect(screen.queryAllByRole("option")).toHaveLength(0)
    expect(screen.getByText(/Ninguna versión coincide/)).toBeInTheDocument()
  })

  it("seleccionar una versión la propaga y cierra el desplegable", async () => {
    const { onChange } = setup({ value: VERSIONS[0].tag })
    await userEvent.click(screen.getByRole("button", { name: /RespaldoCalibracion/ }))
    await userEvent.click(screen.getByRole("option", { name: /_202606_v0/ }))
    expect(onChange).toHaveBeenCalledWith(VERSIONS[2].tag)
    expect(screen.queryAllByRole("option")).toHaveLength(0)
  })

  it("nunca trunca el nombre de la tabla de respaldo", async () => {
    // El sufijo que distingue una versión de otra (`_202607_v2`) va al FINAL del
    // nombre, así que `truncate` corta justo lo único que importa. Medido a
    // 1440px el nombre necesita 367px y la columna del tablero da 212 — se
    // cortaba en el botón y en todas las opciones.
    setup({ value: VERSIONS[0].tag })

    const closed = screen.getByRole("button", { name: /RespaldoCalibracion/ })
    const closedTag = closed.querySelector("span > span")!
    expect(closedTag).toHaveTextContent(VERSIONS[0].tag)
    expect(closedTag.className).not.toContain("truncate")

    await userEvent.click(closed)
    for (const option of screen.getAllByRole("option")) {
      const tag = option.querySelector("span > span")!
      expect(tag.className).not.toContain("truncate")
    }
    // Y el nombre completo de cada versión está presente, no un prefijo.
    for (const v of VERSIONS) {
      expect(screen.getByRole("option", { name: new RegExp(v.tag) })).toBeInTheDocument()
    }
  })

  it("el resumen expone filas y rango de períodos, que es lo que distingue una versión de otra", () => {
    // Sin el rango, un recorte parcial (ej. los _V0/_V1 de bolivia, que arrancan
    // en 202201) sería indistinguible de un respaldo completo.
    const summary = versionSummary(VERSIONS[1])
    expect(summary).toContain("14.253.458 filas")
    expect(summary).toContain("períodos 202101–202607")
  })

  it("distingue un snapshot del input completo de uno que solo fija J", () => {
    // Un tag congela todo el bronze que el pipeline lee (padrón, pesos,
    // diccionarios), no solo J. Los registros viejos fijan solo J: elegir uno de
    // esos NO reproduce la corrida, y el desplegable tiene que decirlo.
    const completo: JVersion = {
      ...VERSIONS[0],
      tables: ["j_atoscompra_new", "hato_cabecalho", "rg_panelis"].map(table => ({
        table,
        table_fqn: `001-calibration-3-0.bronze_chile.${table}`,
        delta_version: 12,
        delta_timestamp: "2026-08-07T13:08:04.000Z",
      })),
      missing_tables: [],
    }
    expect(versionSummary(completo)).toContain("3 tablas fijadas")
    expect(versionSummary(VERSIONS[1])).toContain("solo J fijada")

    const parcial: JVersion = { ...completo, missing_tables: ["grupo", "mordom"] }
    expect(versionSummary(parcial)).toContain("3 tablas fijadas (faltan 2)")
  })
})

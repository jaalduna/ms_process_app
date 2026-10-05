import { describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QmsTrRunCard } from "../QmsTrRunCard"
import type { QmsTrRun } from "../../types"

const mockDownload = vi.fn().mockResolvedValue(undefined)
vi.mock("../../api", () => ({ downloadQmsTrZip: (...a: unknown[]) => mockDownload(...a) }))

function run(overrides: Partial<QmsTrRun> = {}): QmsTrRun {
  return {
    run_id: "r1", country: "colombia", at: "2026-09-11T11:00:00Z", mes_procesamiento: "202608", productos: [],
    status: "running", current_step: "motor_normales",
    steps: [
      { name: "silver_builder", status: "completed", started_at: "2026-09-29T22:21:00Z", completed_at: "2026-09-29T22:30:00Z", error: null },
      { name: "panelistas", status: "completed", started_at: null, completed_at: null, error: null },
      { name: "prep", status: "completed", started_at: null, completed_at: null, error: null },
      { name: "motor_grandes", status: "cancelled", started_at: null, completed_at: null, error: null },
      { name: "motor_normales", status: "running", started_at: null, completed_at: null, error: null },
      { name: "entrega", status: "pending", started_at: null, completed_at: null, error: null },
    ],
    snapshot: { status: "ready", at: "2026-09-11T11:00:00Z", j: { table: "j_atoscompra_new", table_fqn: "x", version: 199, timestamp: "2026-09-11T11:11:35Z" }, tables: [], expected_j_at: null, warnings: [] },
    run_tag: "colombia_202608_abc", databricks_run_id: "1", run_page_url: "https://adb/run/1",
    started_at: null, completed_at: null, created_by: "a@b.com", created_at: "2026-09-29T22:00:00Z",
    updated_at: "2026-09-29T22:00:00Z", error_message: null, validacion: null,
    ...overrides,
  }
}

function renderCard(r: QmsTrRun, props: Partial<Parameters<typeof QmsTrRunCard>[0]> = {}) {
  const onCancel = vi.fn()
  const onValidate = vi.fn()
  render(<QmsTrRunCard run={r} canTrigger canViewDatabricksRun onCancel={onCancel} onValidate={onValidate}
                       cancelling={false} validating={false} {...props} />)
  return { onCancel, onValidate }
}

describe("QmsTrRunCard", () => {
  it("muestra pasos con nombres legibles, la rama omitida y el snapshot fijado", () => {
    renderCard(run())
    const pasos = screen.getByTestId("qmstr-steps")
    expect(within(pasos).getByText("Silver")).toBeInTheDocument()
    expect(pasos.querySelector('[data-step="motor_grandes"]')).toHaveAttribute("data-status", "cancelled")
    expect(within(pasos).getByText("(omitido)")).toBeInTheDocument()
    expect(screen.getByText(/J de las 08:11 del 11-09 \(v199\)/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Ver en Databricks/ })).toHaveAttribute("href", "https://adb/run/1")
  })

  it("en espera explica qué snapshot aguarda y permite cancelar", async () => {
    const { onCancel } = renderCard(run({
      status: "waiting_snapshot",
      snapshot: { status: "waiting", at: "2026-09-29T18:45:00Z", j: null, tables: [], expected_j_at: "2026-09-29T19:00:00Z", warnings: [] },
    }))
    expect(screen.getByTestId("qmstr-run-status")).toHaveTextContent("Esperando snapshot")
    expect(screen.getByText(/snapshot de J de las 16:00 del 29-09/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /Cancelar/ }))
    expect(onCancel).toHaveBeenCalledWith("r1")
  })

  it("completada: descarga y valida", async () => {
    const { onValidate } = renderCard(run({ status: "completed" }))
    await userEvent.click(screen.getByTestId("qmstr-download"))
    expect(mockDownload).toHaveBeenCalledWith("r1")
    await userEvent.click(screen.getByTestId("qmstr-validate"))
    expect(onValidate).toHaveBeenCalledWith("r1")
  })

  it("sin rol no ofrece validar ni cancelar", () => {
    renderCard(run({ status: "completed" }), { canTrigger: false })
    expect(screen.queryByTestId("qmstr-validate")).not.toBeInTheDocument()
    expect(screen.getByTestId("qmstr-download")).toBeInTheDocument()
  })

  it("muestra el resultado de la validación por hoja", () => {
    renderCard(run({
      status: "completed",
      validacion: {
        status: "parcial", validated_at: "2026-09-29T23:00:00Z", validated_by: "a@b.com",
        checked: 4, applied: 2, pending: 1, mismatched: 1,
        by_sheet: { factores: { total: 255, checked: 4, applied: 2, pending: 1, mismatched: 1 } },
        rows: [{ sheet: "Factores", id_ato: 7, id_produto: 29, variable: "FACTOR_RW1", esperado: 80, actual: 100, anterior: 100, resultado: "pendiente" }],
      },
    }))
    expect(screen.getByTestId("qmstr-validacion")).toHaveTextContent("Aplicación parcial")
    expect(screen.getByTestId("qmstr-validacion-factores")).toHaveTextContent("255")
  })
})

import { test, expect, type Page } from "@playwright/test"
import { login } from "./helpers/auth"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * JAA-1435: vista "Flujo QMS-TR" contra el mock del contrato /qmstr_flujo (docs/SPEC_flujo_qmstr_v1.1.md §2).
 * Sembrado: Ecuador y Bolivia 202609; Ecuador con la tanda 4 corriendo, la 2 en DQ, la 1 cerrada y una reversión.
 */
async function abrir(page: Page) {
  const nav = page.getByRole("navigation", { name: /main navigation/i })
  await nav.getByRole("link", { name: "Flujo QMS-TR", exact: true }).click()
  await expect(page).toHaveURL(/\/qms-tr\/flujo/, { timeout: 10_000 })
  await expect(page.getByTestId("qf-tablero")).toBeVisible({ timeout: 15_000 })
}

test.describe("Flujo QMS-TR", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, { qmstr: true })
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
  })

  test("cabecera, tablero por país y período, y progreso en vivo de la corrida", { tag: "@smoke" }, async ({ page }) => {
    await abrir(page)
    await expect(page.getByRole("heading", { name: "Flujo QMS-TR" })).toBeVisible()
    await expect(page.getByTestId("qf-modo")).toHaveText(/Simulación/)
    await expect(page.getByTestId("qf-loop")).toContainText("cada 5 min")

    const tablero = page.getByTestId("qf-tablero")
    await expect(tablero.getByRole("heading", { name: "Ecuador" })).toBeVisible()
    await expect(page.getByTestId("qf-kpi-h4")).toContainText("95")
    await expect(page.getByTestId("qf-celdas").getByRole("listitem")).toHaveCount(103)

    // la tanda 4 está corriendo: progreso Databricks con for_each por tarea
    const t4 = page.getByTestId("qf-tanda-4")
    await expect(t4).toHaveAttribute("data-estado", "corriendo")
    const progreso = t4.getByTestId("qf-progreso")
    await expect(progreso).toBeVisible()
    await expect(t4.getByTestId("qf-progreso-pct")).toHaveText(/^\d+%$/)
    expect(Number(await progreso.getAttribute("data-porcentaje"))).toBeGreaterThanOrEqual(35)
    await expect(progreso.locator('[data-tarea="motor_normales"]')).toContainText("/23")
    await expect(t4.getByTestId("qf-stepper").locator('[data-paso="corriendo"]')).toHaveAttribute("data-estado", "actual")

    // la leyenda filtra la tabla de bases
    await page.getByTestId("qf-leyenda").getByRole("button", { name: /Retenidas/ }).click()
    await expect(page.getByTestId("qf-tabla-bases").locator("tbody tr")).toHaveCount(5)

    // otro país y otro período
    await page.getByTestId("qf-paises").getByRole("radio", { name: /Bolivia/ }).click()
    await expect(tablero.getByRole("heading", { name: "Bolivia" })).toBeVisible()
    await page.getByTestId("qf-tab-tandas").click()
    await expect(page.getByTestId("qf-tanda-1")).toHaveAttribute("data-estado", "revision_manual")
    await expect(page.getByTestId("qf-tanda-1").getByRole("alert")).toContainText("verificación en J")
    await page.getByTestId("qf-periodo").click()
    await page.getByRole("option", { name: /agosto 2026/i }).click()
    await expect(tablero).toContainText(/agosto 2026/i)
    await expect(page.getByTestId("qf-kpi-aplicadas")).toContainText("58")
  })

  test("un país sin períodos legibles muestra el error con reintentar, no un esqueleto eterno", { tag: "@smoke" }, async ({ page }) => {
    await abrir(page)
    // navegación del lado del cliente (un goto duro pierde la sesión de dev)
    await page.evaluate(() => {
      history.pushState({}, "", `${location.pathname}?pais=XX`)
      dispatchEvent(new PopStateEvent("popstate"))
    })
    const alerta = page.getByRole("alert").filter({ hasText: "No se pudieron leer los períodos" })
    await expect(alerta).toBeVisible({ timeout: 15_000 })
    await expect(alerta).toContainText("País no configurado")
    await expect(alerta.getByRole("button", { name: /Reintentar/ })).toBeVisible()
  })

  test("override: país, período y bases; advertencia sin hito 4 hasta forzar", { tag: "@smoke" }, async ({ page }) => {
    await abrir(page)
    await page.getByTestId("qf-lanzar").click()
    const dlg = page.getByTestId("qf-override")
    await expect(dlg).toBeVisible()
    await dlg.getByTestId("qf-override-pais").getByRole("radio", { name: "Bolivia" }).click()
    await expect(dlg.getByTestId("qf-override-periodo")).toContainText(/septiembre 2026/i)
    await expect(dlg.getByTestId("qf-override-revisar")).toBeDisabled()

    await dlg.getByTestId("qf-override-liberadas").click()
    await expect(dlg.getByTestId("qf-override-revisar")).toHaveText(/Revisar 8 bases/)
    // una base en otra tanda no se puede elegir
    await expect(dlg.getByTestId("qf-override-base-12")).toBeDisabled()
    // una retenida pide forzar
    await dlg.getByTestId("qf-override-buscar").fill("63")
    await dlg.getByTestId("qf-override-base-63").click()
    await expect(dlg.getByTestId("qf-override-advertencia")).toBeVisible()
    await expect(dlg.getByTestId("qf-override-revisar")).toBeDisabled()
    await dlg.getByTestId("qf-override-forzar").click()
    await expect(dlg.getByTestId("qf-override-revisar")).toBeEnabled()
    await dlg.getByTestId("qf-override-revisar").click()
    await expect(dlg.getByTestId("qf-override-resumen")).toContainText("9 bases")
    await expect(dlg.getByTestId("qf-override-resumen")).toContainText("Bolivia")
  })

  test("override: una base aplicada se ve pero no se puede elegir ni entra en Elegir liberadas", async ({ page }) => {
    await abrir(page)
    await page.getByTestId("qf-lanzar").click()
    const dlg = page.getByTestId("qf-override")
    await dlg.getByTestId("qf-override-liberadas").click()
    const fila = dlg.getByRole("listitem").filter({ hasText: "Ya tiene QMS-TR aplicado: revírtela primero" }).first()
    await expect(fila).toBeVisible()
    await expect(fila.getByRole("checkbox")).toBeDisabled()
    await expect(fila.getByRole("checkbox")).toHaveAccessibleDescription(/revírtela primero/)
    await expect(fila.getByRole("checkbox")).not.toBeChecked()
    await expect(dlg.getByTestId("qf-override-revisar")).toHaveText(/Revisar 7 bases/)

    // en "solo correr" no se aplica nada en J: la base aplicada sí se puede elegir; al volver a completo se quita con aviso
    const testid = await fila.getByRole("checkbox").getAttribute("data-testid")
    const cb = dlg.getByTestId(testid!)
    await dlg.getByTestId("qf-override-modo-solo_correr").click()
    await expect(cb).toBeEnabled()
    await cb.click()
    await expect(dlg.getByTestId("qf-override-revisar")).toHaveText(/Revisar 8 bases/)
    await dlg.getByTestId("qf-override-modo-completo").click()
    await expect(dlg.getByTestId("qf-override-aviso")).toContainText("Se quitaron 1 base")
    await expect(dlg.getByTestId("qf-override-revisar")).toHaveText(/Revisar 7 bases/)
  })

  test("lanzar override: la tanda corre con progreso, llega a DQ y cierra al simular el ticket", async ({ page }) => {
    await abrir(page)
    await page.getByTestId("qf-lanzar").click()
    const dlg = page.getByTestId("qf-override")
    await dlg.getByTestId("qf-override-liberadas").click()
    await dlg.getByTestId("qf-override-nota").fill("Prueba e2e")
    await dlg.getByTestId("qf-override-revisar").click()
    await expect(dlg.getByTestId("qf-override-resumen")).toContainText("7 bases")
    await dlg.getByTestId("qf-override-confirmar").click()
    await expect(page.getByText(/Tanda 5 lanzada/)).toBeVisible()
    await expect(dlg).toBeHidden()

    const t5 = page.getByTestId("qf-tanda-5")
    await expect(t5).toHaveAttribute("data-tipo", "manual")
    await expect(t5.getByTestId("qf-progreso")).toBeVisible({ timeout: 30_000 })
    const inicial = Number(await t5.getByTestId("qf-progreso").getAttribute("data-porcentaje"))
    await expect.poll(async () => Number(await t5.getByTestId("qf-progreso").getAttribute("data-porcentaje", { timeout: 1000 }).catch(() => "100")),
      { timeout: 30_000 }).toBeGreaterThan(inicial)
    await expect(t5).toHaveAttribute("data-estado", "en_dq", { timeout: 90_000 })
    await t5.getByTestId("qf-accion-simular_cierre_ticket").click()
    await expect(t5).toHaveAttribute("data-estado", "cerrada", { timeout: 60_000 })
    await page.getByTestId("qf-tab-correos").click()
    await expect(page.getByTestId("qf-bandeja")).toContainText("tanda 5 · resultados")
  })

  test("revertir bases de una tanda cerrada", async ({ page }) => {
    await abrir(page)
    await page.getByTestId("qf-tanda-1").getByTestId("qf-accion-revertir").click()
    const dlg = page.getByTestId("qf-revertir")
    await expect(dlg.getByTestId("qf-revertir-base-13")).toBeDisabled() // ya revertida en la tanda 3
    await dlg.getByTestId("qf-revertir-base-10").click()
    await expect(dlg.getByTestId("qf-revertir-revisar")).toBeDisabled()
    await dlg.getByTestId("qf-revertir-motivo").fill("Pedido de DC por correo 08/10")
    await dlg.getByTestId("qf-revertir-revisar").click()
    await dlg.getByTestId("qf-revertir-confirmar").click()
    await expect(page.getByText(/Reversión en marcha/)).toBeVisible()
    await expect(page.getByTestId("qf-tanda-5")).toHaveAttribute("data-tipo", "reversion")
  })
})

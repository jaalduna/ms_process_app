import { test, expect, type Browser, type Page } from "@playwright/test"
import path from "path"

/**
 * Flujo QMS-TR (JAA-1435) contra la API REAL en modo fake, no contra el mock: es la prueba que
 * caza las divergencias mock vs API (contrato de Tanda, correos, errores, reglas de reversión).
 *
 * RUNBOOK (gate manual de integración; la CI no levanta el backend Python):
 *   1. En ms-process-api, con un registry NUEVO (la API no tiene /test/reset), levantar
 *      `scripts/qmstr_flujo_fake_api.py` (ver su docstring): DATABRICKS_FAKE + hitos, J y zip de
 *      la corrida simulados, flujo en simulación para Ecuador.
 *   2. Aquí: `npm run dev:e2e` (auth bypass).
 *   3. REAL_BACKEND=http://127.0.0.1:8011 npx playwright test e2e/qmstr-flujo-real-api.spec.ts
 *      Con SHOTS_DIR=docs/qmstr_flujo además deja las capturas integracion_*.png.
 *
 * Sin REAL_BACKEND el spec se salta solo: el `npx playwright test` de siempre (mock) sigue verde.
 */
const REAL_BACKEND = process.env.REAL_BACKEND
const REAL_API_BASE = `${REAL_BACKEND ?? "http://127.0.0.1:8011"}/api/v1`
const SHOTS_DIR = process.env.SHOTS_DIR

async function abrir(page: Page, theme: "light" | "dark" = "light") {
  await page.addInitScript((t) => localStorage.setItem("theme", t), theme)
  await page.route("**/config.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: [
      `window.__BRIDGE_CONFIG__ = { API_URL: "${REAL_API_BASE}" };`,
      // la API real no expone telemetría ni /processes/status (como deploy/config.*.js)
      `window.__APP_CONFIG__ = { modules: { overview: true, qmstr: true }, features: { telemetry: false, processStatus: false } };`,
    ].join("\n"),
  }))
  await page.goto("/ms-process-app/")
  await page.getByRole("button", { name: /continue \(dev\)/i }).click()
  // la sesión dev vive en memoria: se navega por el menú, no con goto
  await page.getByRole("navigation", { name: /main navigation/i }).getByRole("link", { name: "Flujo QMS-TR", exact: true }).click()
  await expect(page.getByTestId("qf-tablero")).toBeVisible({ timeout: 15_000 })
}

async function foto(page: Page, nombre: string, fullPage = true) {
  if (!SHOTS_DIR) return
  // que los toasts no tapen la captura
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(SHOTS_DIR, `integracion_${nombre}.png`), fullPage })
}

/** La API avanza las tandas en cada vuelta (cada 60 s); "Forzar vuelta" no espera el intervalo. */
async function vuelta(page: Page) {
  await page.getByTestId("qf-forzar-vuelta").click()
  await expect(page.getByText(/Vuelta lista/).first()).toBeVisible({ timeout: 15_000 })
}

async function hastaEstado(page: Page, numero: number, estado: string, timeout = 90_000) {
  const card = page.getByTestId(`qf-tanda-${numero}`)
  await expect.poll(async () => {
    if ((await card.getAttribute("data-estado").catch(() => null)) !== estado) await vuelta(page)
    return card.getAttribute("data-estado")
  }, { timeout, intervals: [3_000] }).toBe(estado)
  return card
}

async function oscuro(browser: Browser) {
  if (!SHOTS_DIR) return
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark", baseURL: test.info().project.use.baseURL })
  const page = await ctx.newPage()
  await abrir(page, "dark")
  await page.waitForTimeout(800)
  await foto(page, "flujo_dark")
  await page.getByTestId("qf-tab-correos").click()
  await page.getByTestId("qf-bandeja").waitFor()
  await foto(page, "correos_dark")
  await ctx.close()
}

test.describe("Flujo QMS-TR contra la API real (fake)", () => {
  test.skip(!REAL_BACKEND, "REAL_BACKEND no definido: este spec corre contra ms-process-api en modo fake")
  test.use({ viewport: { width: 1440, height: 900 } })

  test("override de 3 bases → corrida con progreso → DQ → cierre simulado → correos → revertir 1 base", async ({ page, browser }) => {
    test.setTimeout(300_000)
    await abrir(page)
    await expect(page.getByTestId("qf-modo")).toHaveText(/Simulación/)
    await expect(page.getByTestId("qf-loop")).toContainText("cada 1 min")
    await expect(page.getByTestId("qf-tablero").getByRole("heading", { name: "Ecuador" })).toBeVisible()
    await expect(page.getByTestId("qf-kpi-retenidas")).toContainText("4")
    await foto(page, "tablero_inicial")

    // override: 3 bases liberadas, nota; la 701 (fuera de alcance) no se puede elegir
    await page.getByTestId("qf-lanzar").click()
    const dlg = page.getByTestId("qf-override")
    await expect(dlg.getByTestId("qf-override-base-701")).toBeDisabled()
    for (const b of [101, 102, 103]) await dlg.getByTestId(`qf-override-base-${b}`).click()
    await dlg.getByTestId("qf-override-nota").fill("Prueba de integración contra la API real")
    await foto(page, "override", false)
    await dlg.getByTestId("qf-override-revisar").click()
    await expect(dlg.getByTestId("qf-override-resumen")).toContainText("3 bases")
    await dlg.getByTestId("qf-override-confirmar").click()
    await expect(page.getByText(/Tanda 1 lanzada: 3 bases de Ecuador, septiembre 2026/)).toBeVisible()

    const t1 = page.getByTestId("qf-tanda-1")
    await expect(t1).toHaveAttribute("data-tipo", "manual")
    await expect(t1.getByTestId("qf-tanda-nota")).toContainText("Prueba de integración")
    // la vuelta dispara la corrida (cliente Databricks fake) y la tarjeta muestra el for_each en vivo
    await vuelta(page)
    await expect(t1).toHaveAttribute("data-estado", "corriendo", { timeout: 15_000 })
    await expect(t1.getByTestId("qf-progreso")).toBeVisible({ timeout: 15_000 })
    await expect.poll(async () => Number(await t1.getByTestId("qf-progreso").getAttribute("data-porcentaje", { timeout: 1000 }).catch(() => "100")),
      { timeout: 60_000 }).toBeGreaterThan(0)
    await foto(page, "corriendo")
    await expect(t1.getByTestId("qf-progreso-fin")).toBeVisible({ timeout: 90_000 })

    // la corrida terminó: ticket SIM-n, la última base sin cambios del motor (bypass)
    await hastaEstado(page, 1, "en_dq")
    await expect(t1).toContainText(/SIM-\d+/)
    await expect(t1).toContainText("1 sin cambios del motor")
    await t1.getByTestId("qf-accion-simular_cierre_ticket").click()
    await expect(page.getByText(/con el ticket cerrado/)).toBeVisible()
    await hastaEstado(page, 1, "cerrada")
    await expect(t1).toContainText(/Verificación en J: \d+ de \d+ aplicados/)
    await expect(page.getByTestId("qf-kpi-aplicadas")).toContainText("2")
    await foto(page, "cerrada")

    // bandeja: resultados y pase a MTR simulados (en simulación el pase sale como correo nuevo)
    await page.getByTestId("qf-tab-correos").click()
    const bandeja = page.getByTestId("qf-bandeja")
    await expect(bandeja).toContainText("tanda 1 · resultados")
    await expect(bandeja).toContainText("tanda 1 · pase a MTR")
    await expect(page.getByTestId("qf-correo-preview")).toContainText("Simulado, no se envió")
    await foto(page, "correos")

    // revertir 1 base del zip; la de bypass no aparece
    await page.getByTestId("qf-tab-tandas").click()
    await t1.getByTestId("qf-accion-revertir").click()
    const rev = page.getByTestId("qf-revertir")
    await expect(rev.getByTestId("qf-revertir-base-103")).toHaveCount(0)
    await rev.getByTestId("qf-revertir-base-102").click()
    await rev.getByTestId("qf-revertir-motivo").fill("DC pidió revertir Yogurt")
    await foto(page, "revertir", false)
    await rev.getByTestId("qf-revertir-revisar").click()
    await rev.getByTestId("qf-revertir-confirmar").click()
    await expect(page.getByText(/Reversión en marcha \(tanda 2\): 1 base de la tanda 1/)).toBeVisible()
    const t2 = page.getByTestId("qf-tanda-2")
    await expect(t2).toHaveAttribute("data-tipo", "reversion")
    await expect(t2.getByTestId("qf-tanda-nota")).toContainText("Motivo: DC pidió revertir Yogurt")
    await hastaEstado(page, 2, "en_dq")
    await t2.getByTestId("qf-accion-simular_cierre_ticket").click()
    await hastaEstado(page, 2, "cerrada")
    await expect(page.getByTestId("qf-kpi-revertidas")).toContainText("1")
    await foto(page, "revertida")

    await oscuro(browser)
  })
})

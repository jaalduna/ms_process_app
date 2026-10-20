import { test, expect, type Page } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * Flujo iterativo de Elegibilidad y Pesaje (specs/SPEC-iteracion.md) contra el mock:
 * preparar → iterar → comparar → aprobar y publicar, y la dependencia de Pesaje sobre
 * Elegibilidad publicada del mismo cierre.
 */

async function captura(page: Page, nombre: string) {
  await test.info().attach(nombre, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" })
}

test.beforeEach(async ({ page }) => {
  await setModuleConfig(page, {})
  await page.request.post(`${MOCK_API_BASE}/test/reset`)
  await login(page)
})

test("elegibilidad: muestra el aviso de datos simulados y bloquea iterar sin preparar", { tag: "@smoke" }, async ({ page }) => {
  await navigateTo(page, "Elegibilidad", /elegibilidad/)
  await expect(page.getByTestId("it-aviso-simulado")).toBeVisible()
  await expect(page.getByTestId("it-paso-iterar")).toBeDisabled()
})

test("elegibilidad: preparar → iterar → escenario → enviar → aprobar; luego Pesaje se habilita", async ({ page }) => {
  await navigateTo(page, "Elegibilidad", /elegibilidad/)
  await page.getByTestId("it-pais-brasil").click()
  await page.getByTestId("it-preparar").click()
  await expect(page.getByTestId("it-continuar-iterar")).toBeVisible({ timeout: 20_000 })
  await captura(page, "1-preparar")
  await page.getByTestId("it-continuar-iterar").click()

  // Iterar: cerrar una región recalcula y la deja sin imputar.
  const norte = page.getByTestId("it-region-N")
  await expect(norte).toBeVisible()
  await norte.getByRole("button", { name: "No imputar en Norte" }).click()
  await expect(norte.getByText("Sin imputar")).toBeVisible()
  await captura(page, "2-iterar")

  await page.getByLabel("Guardar esta vuelta como escenario").fill("Sin Norte")
  await page.getByTestId("it-guardar-escenario").click()

  // Comparar: el escenario nuevo aparece y se elige.
  await page.getByTestId("it-paso-comparar").click()
  const fila = page.getByRole("row").filter({ hasText: "Sin Norte" })
  await expect(fila).toBeVisible()
  await expect(fila).toContainText("Sin imputar: N")
  await fila.getByRole("button", { name: "Elegir" }).click()
  await expect(fila).toContainText("Elegido")
  await captura(page, "3-comparar")

  // Publicar: el dev user es admin, así que envía y también aprueba.
  await page.getByTestId("it-paso-publicar").click()
  await expect(page.getByText("Escenario:")).toContainText("Sin Norte")
  await page.getByTestId("it-enviar").click()
  await expect(page.getByTestId("it-estado-publicacion")).toHaveText("Pendiente de aprobación")
  await page.getByTestId("it-aprobar").click()
  await expect(page.getByTestId("it-estado-publicacion")).toHaveText("Publicada")
  await expect(page.getByText(/^Aprobado por .*\(simulado\) no se escribió en SQL/)).toBeVisible()
  await captura(page, "4-publicar")

  // Pesaje del mismo cierre ya puede prepararse; OOH aparece como panel aparte.
  await navigateTo(page, "Pesaje", /pesaje/)
  // La ruta carga perezosa: mientras tanto sigue en pantalla la página anterior.
  await expect(page.getByRole("heading", { name: "Pesaje" })).toBeVisible()
  await page.getByTestId("it-pais-brasil").click()
  await expect(page.getByTestId("it-preparar")).toBeEnabled()
  await expect(page.getByTestId("it-pais-brasil_ooh")).toBeVisible()
  await page.getByTestId("it-preparar").click()
  await expect(page.getByTestId("it-continuar-iterar")).toBeVisible({ timeout: 20_000 })
  await page.getByTestId("it-continuar-iterar").click()
  await expect(page.getByTestId("it-idpeso-1")).toBeVisible()
  await captura(page, "5-pesaje-iterar")
})

test("pesaje: sin Elegibilidad publicada no deja preparar", async ({ page }) => {
  await navigateTo(page, "Pesaje", /pesaje/)
  await expect(page.getByRole("heading", { name: "Pesaje" })).toBeVisible()
  await page.getByTestId("it-pais-chile").click()
  await expect(page.getByTestId("it-preparar")).toBeDisabled()
  await expect(page.getByText(/Se habilita cuando Elegibilidad/)).toBeVisible()
})

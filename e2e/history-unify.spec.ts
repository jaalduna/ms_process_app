import { test, expect, type Page } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * JAA-424 — unified history view across precios, elegibilidad y calibración.
 *
 * Each module's history modal must follow the pesaje grid (Periodo | Estado |
 * Fecha | Duración | Resumen | Acciones) and offer, per row, an eye that opens
 * the module's DetailModal and a download honoring that module's mechanism:
 *   - precios:     client-side CSV of outliers
 *   - calibración: multi-table picker (existing flow, preserved)
 *   - elegibilidad: Phase A results file download
 */

test.beforeEach(async ({ page }) => {
  await setModuleConfig(page, {})
  await page.request.post(`${MOCK_API_BASE}/test/reset`)
})

const GRID_HEADERS = ["Periodo", "Estado", "Fecha", "Duracion", "Resumen", "Acciones"]

async function assertGrid(dialog: ReturnType<Page["getByRole"]>) {
  for (const h of GRID_HEADERS) {
    await expect(dialog.getByText(h, { exact: true }).first()).toBeVisible()
  }
  // The grid must fit the dialog: no annoying horizontal scroll (mirrors the
  // pesaje fix — dialog widened to sm:max-w-3xl + fluid minmax() columns).
  const overflow = await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}

test("precios history: grid + eye→detail + download outliers CSV", async ({ page }) => {
  await login(page)
  await navigateTo(page, "Precios", /precios/)

  // The whole Chile card is the history trigger.
  await page.locator('[aria-label="View price validation history for Chile"]')
    .locator('[data-slot="card-title"]').click()

  const history = page.getByRole("dialog").filter({ hasText: "Historial de Precios" })
  await expect(history).toBeVisible({ timeout: 10_000 })
  await assertGrid(history)

  // Eye → PricesDetailModal.
  await history.getByTitle("Ver detalle").first().click()
  await expect(page.getByText("Price Validation Detail")).toBeVisible({ timeout: 10_000 })
  await page.keyboard.press("Escape")

  // Download → client-side outliers CSV (seeded Chile run is approved w/ outliers).
  const dl = page.waitForEvent("download", { timeout: 15_000 })
  await history.getByTitle("Descargar CSV de outliers").first().click()
  const file = await dl
  expect(file.suggestedFilename()).toMatch(/prices_outliers_.*\.csv$/)
})

test("calibracion history: grid + eye→detail + table-picker download", async ({ page }) => {
  await login(page)
  await navigateTo(page, "calibraci", /calibration|calibraci/i)

  await page.getByLabel(/view calibration history for argentina/i).click()

  const history = page.getByRole("dialog").filter({ hasText: "Historial de Calibracion" })
  await expect(history).toBeVisible({ timeout: 10_000 })
  await assertGrid(history)

  // Eye → CalibrationDetailModal (fetched on demand).
  await history.getByTitle("Ver detalle").first().click()
  await expect(page.getByText("Calibration Detail")).toBeVisible({ timeout: 10_000 })
  await page.keyboard.press("Escape")

  // Download still uses the multi-table picker.
  await history.getByTitle("Descargar CSV").first().click()
  await expect(history.getByText(/failed to load tables/i)).toHaveCount(0)
  const tableSelect = history.getByRole("combobox")
  await expect(tableSelect).toBeVisible({ timeout: 10_000 })
  await tableSelect.click()
  await page.getByRole("option").first().click()
  const dl = page.waitForEvent("download", { timeout: 30_000 })
  await history.getByRole("button", { name: /^download$/i }).click()
  const file = await dl
  expect(file.suggestedFilename()).toMatch(/\.csv$/)
})

test("elegibilidad history: button on card + grid + eye→detail + Phase A download", async ({ page }) => {
  await login(page)
  await navigateTo(page, "Elegibilidad", /elegibilidad/)

  // Mexico has a seeded "ready" run with Phase A results.
  const card = page.locator('[data-slot="card"]').filter({ hasText: "Mexico" })
  await expect(card).toBeVisible({ timeout: 10_000 })
  await card.getByRole("button", { name: /ver historial de elegibilidad/i }).click()

  const history = page.getByRole("dialog").filter({ hasText: "Historial de Elegibilidad" })
  await expect(history).toBeVisible({ timeout: 10_000 })
  await assertGrid(history)

  // Eye → EligibilityDetailModal.
  await history.getByTitle("Ver detalle").first().click()
  await expect(page.getByText("Detalle Elegibilidad")).toBeVisible({ timeout: 10_000 })
  await page.keyboard.press("Escape")

  // Download → Phase A results file.
  const dl = page.waitForEvent("download", { timeout: 15_000 })
  await history.getByTitle("Descargar resultados (Phase A)").first().click()
  const file = await dl
  expect(file.suggestedFilename()).toMatch(/eligibility_results_.*\.csv$/)
})

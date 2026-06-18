import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * Calibration History CSV download — streaming flow.
 *
 * Exercises the mock-server's streamed /events/:jobId/download endpoint via the
 * UI: open a country's Calibration History, expand the table picker (must NOT
 * show "Failed to load tables"), pick a table, and confirm the browser receives
 * a non-empty CSV download.
 */
test.beforeEach(async ({ page }) => {
  await setModuleConfig(page, {})
  await page.request.post(`${MOCK_API_BASE}/test/reset`)
})

test("downloads a streamed CSV from Argentina calibration history", async ({ page }) => {
  await login(page)
  await navigateTo(page, "calibraci", /calibration|calibraci/i)

  // Open Argentina's Calibration History modal.
  await page.getByLabel(/view calibration history for argentina/i).click()

  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText(/Historial de Calibracion/i)).toBeVisible({ timeout: 10_000 })

  // At least one completed run with an enabled download button (unified grid, JAA-424).
  const downloadBtn = dialog.getByRole("button", { name: /descargar csv de/i }).first()
  await expect(downloadBtn).toBeEnabled({ timeout: 10_000 })
  await downloadBtn.click()

  // The table picker loads — it must NOT error.
  await expect(dialog.getByText(/failed to load tables/i)).toHaveCount(0)

  // Argentina has multiple tables → a Select + Download button render.
  const tableSelect = dialog.getByRole("combobox")
  await expect(tableSelect).toBeVisible({ timeout: 10_000 })
  await tableSelect.click()
  await page.getByRole("option").first().click()

  // Trigger the download and capture the file.
  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 })
  await dialog.getByRole("button", { name: /^download$/i }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/\.csv$/)
  const path = await download.path()
  expect(path).toBeTruthy()

  const fs = await import("node:fs")
  const size = fs.statSync(path!).size
  // A streamed table export is substantial (thousands of rows), not the ~1 KB
  // job-report fallback.
  expect(size).toBeGreaterThan(100_000)
})

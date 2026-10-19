import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * JAA-757/758 — native signed-URL download, replacing axios-blob.
 *
 * downloadCalibrationReport / downloadWeightingCSV now GET a `download-url`
 * (still authenticated, same as before) and then navigate the browser to the
 * returned `download-signed` URL instead of fetching a blob + createObjectURL.
 * Asserts BOTH the observable native download AND that the old
 * `.../download` (blob) endpoint is no longer the one hit.
 */

test.beforeEach(async ({ page }) => {
  await setModuleConfig(page, {})
  await page.request.post(`${MOCK_API_BASE}/test/reset`)
  await login(page)
})

test("calibracion: Download Report hits download-url then download-signed, triggers a native download", async ({ page }) => {
  await navigateTo(page, "calibraci", /calibration|calibraci/i)
  await page.getByLabel(/view calibration history for argentina/i).click()

  const history = page.getByRole("dialog").filter({ hasText: /Historial de Calibracion/i })
  await expect(history).toBeVisible({ timeout: 10_000 })

  await history.getByTitle("Ver detalle").first().click()
  const detail = page.getByRole("dialog").filter({ hasText: "Calibration Detail" })
  await expect(detail).toBeVisible({ timeout: 10_000 })

  const requestUrls: string[] = []
  page.on("request", (req) => requestUrls.push(req.url()))

  const downloadPromise = page.waitForEvent("download", { timeout: 15_000 })
  await detail.getByRole("button", { name: /download report/i }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/\.zip$/)
  expect(requestUrls.some((u) => u.includes("/download-url"))).toBe(true)
  expect(requestUrls.some((u) => u.includes("/download-signed"))).toBe(true)
  expect(requestUrls.some((u) => /\/calibration\/[^/]+\/download\?/.test(u))).toBe(false)
})

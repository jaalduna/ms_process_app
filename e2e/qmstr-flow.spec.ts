import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * JAA-988: end-to-end run lifecycle for the rebuilt QMS-TR page against the
 * /qms_tr mock (JAA-986/JAA-987) -- pick a country, set ano_base, Ejecutar,
 * watch the API-driven steps advance via polling, download the zip.
 */
test.describe("QMS-TR run flow", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, { qmstr: true })
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
    const nav = page.getByRole("navigation", { name: /main navigation/i })
    await nav.getByRole("link", { name: "QMS-TR", exact: true }).click()
    await expect(page).toHaveURL(/\/qms-tr$/, { timeout: 10_000 })
  })

  test("Brasil: set ano_base, Ejecutar, steps advance, download the zip", { tag: "@smoke" }, async ({ page }) => {
    const card = page.locator('[data-slot="card"]', { hasText: "Brasil" })
    await expect(card).toBeVisible({ timeout: 10_000 })

    const anoBaseInput = card.getByLabel("Año base")
    await anoBaseInput.fill("2025")

    await card.getByRole("button", { name: "Ejecutar" }).click()
    const dialog = page.getByRole("alertdialog")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText("2025")).toBeVisible()
    await dialog.getByRole("button", { name: "Confirmar" }).click()

    // steps come from the API (silver_builder/kpis_batch/export_zip), not a
    // hardcoded MTR DAG -- assert the first real step label appears.
    await expect(card.getByText("Silver Builder")).toBeVisible({ timeout: 10_000 })

    const downloadBtn = card.getByRole("button", { name: /Descargar/ })
    await expect(downloadBtn).toBeVisible({ timeout: 30_000 })

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadBtn.click(),
    ])
    expect(download.suggestedFilename()).toMatch(/^qms_tr_brasil_2025_.*\.zip$/)
  })

  test("no UI text mentions the old MTR DAG step names or removed scope fields", async ({ page }) => {
    const bodyText = await page.locator("body").innerText()
    for (const forbidden of ["copy_bridge", "tag_run", "run_stage", "publish_gold"]) {
      expect(bodyText).not.toContain(forbidden)
    }
    for (const forbidden of [/\bCanal\b/, /\bRegi[oó]n\b/, /\bMarca\b/, /\bKPIs? de salida\b/]) {
      expect(bodyText).not.toMatch(forbidden)
    }
  })
})

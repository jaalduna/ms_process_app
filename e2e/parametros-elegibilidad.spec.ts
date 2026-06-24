import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * JAA-547 — eligibility-params editor walkthrough. Proves the trust gate end to
 * end against the mock-server (no real backend):
 *   select country → edit a table → live validation flags an error and BLOCKS
 *   publish → the review dialog shows the before→after diff with publish
 *   disabled → fix → publish (happy path) hits POST /params/.../publish and
 *   shows a confirmation.
 */
test.describe("Parámetros de elegibilidad — editor", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
  })

  test(
    "validate blocks publish, dialog shows diff, happy-path publish confirms",
    { tag: "@smoke" },
    async ({ page }) => {
      await login(page)

      // Reach the editor from the main nav (admin-gated, dev user is admin).
      const nav = page.getByRole("navigation", { name: /main navigation/i })
      await nav.getByRole("link", { name: /Editor de Parámetros/i }).click()
      await expect(page).toHaveURL(/\/parametros-elegibilidad/, { timeout: 10_000 })

      // Country selector present; default lands on CL + the Code_Parametros tab.
      await expect(page.getByTestId("country-select")).toBeVisible()
      const firstVar = page.getByTestId("code-variable-0")
      await expect(firstVar).toBeVisible({ timeout: 10_000 })

      // --- introduce an error: duplicate the first Variable into row 1 ---------
      const dupValue = await firstVar.inputValue()
      const secondVar = page.getByTestId("code-variable-1")
      await secondVar.fill(dupValue)

      // Live validation surfaces the error and the status pill reports it.
      await expect(page.getByTestId("status-pill")).toContainText(/error/i)

      // The dialog shows the diff but publish is BLOCKED while invalid.
      await page.getByTestId("open-review").click()
      const dialog = page.getByTestId("review-dialog")
      await expect(dialog).toBeVisible()
      await expect(page.getByTestId("dialog-error-badge")).toBeVisible()
      await expect(page.getByTestId("diff-table")).toBeVisible()
      await expect(page.getByTestId("diff-row").first()).toBeVisible()
      await expect(page.getByTestId("confirm-publish")).toBeDisabled()

      // --- fix the error -------------------------------------------------------
      await page.getByRole("button", { name: /cancelar/i }).click()
      await expect(dialog).toBeHidden()
      await secondVar.fill("umbral_nuevo")
      await expect(page.getByTestId("status-pill")).toContainText(/válido/i)

      // --- happy-path publish: hits the mock publish endpoint + confirms -------
      await page.getByTestId("open-review").click()
      await expect(page.getByTestId("confirm-publish")).toBeEnabled()

      const publishResponse = page.waitForResponse(
        (r) =>
          r.url().includes("/params/Code_Parametros/CL/publish") &&
          r.request().method() === "POST" &&
          r.status() === 200,
      )
      await page.getByTestId("confirm-publish").click()
      const resp = await publishResponse

      // The response came from the mock origin (no real backend running).
      expect(resp.url()).toContain(MOCK_API_BASE)
      const body = await resp.json()
      expect(body.parquet_path).toContain("CL/Parametros/Code_Parametros.parquet")

      // Confirmation toast is shown.
      await expect(page.getByText(/Publicado: Code_Parametros/i)).toBeVisible({ timeout: 10_000 })
    },
  )

  // JAA-628 — Excel round-trip: download the per-country workbook, (mock) upload
  // an edited one, review the diff the backend /import returns, and publish.
  test(
    "Excel round-trip: descargar → importar → ver diff → publicar",
    { tag: "@smoke" },
    async ({ page }) => {
      await login(page)

      const nav = page.getByRole("navigation", { name: /main navigation/i })
      await nav.getByRole("link", { name: /Editor de Parámetros/i }).click()
      await expect(page).toHaveURL(/\/parametros-elegibilidad/, { timeout: 10_000 })
      await expect(page.getByTestId("params-excel-toolbar")).toBeVisible({ timeout: 10_000 })

      // --- descargar: streams params_CL.xlsx (Content-Disposition) -------------
      const downloadPromise = page.waitForEvent("download", { timeout: 30_000 })
      await page.getByTestId("download-excel-btn").click()
      const download = await downloadPromise
      expect(download.suggestedFilename()).toMatch(/^params_CL\.xlsx$/)

      // --- importar: feed a file → POST /import → review dialog opens ----------
      await page.getByTestId("import-excel-input").setInputFiles({
        name: "params_CL.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: Buffer.from("edited workbook"),
      })

      const dialog = page.getByTestId("review-dialog")
      await expect(dialog).toBeVisible({ timeout: 10_000 })
      // the backend preview reports a +1 row diff for Code_Parametros
      await expect(page.getByTestId("diff-table")).toBeVisible()
      await expect(page.getByTestId("diff-row").first()).toBeVisible()
      await expect(page.getByTestId("confirm-publish")).toBeEnabled()

      // --- publicar: reuses the per-table publish endpoint --------------------
      const publishResponse = page.waitForResponse(
        (r) =>
          r.url().includes("/params/Code_Parametros/CL/publish") &&
          r.request().method() === "POST" &&
          r.status() === 200,
      )
      await page.getByTestId("confirm-publish").click()
      const resp = await publishResponse
      expect(resp.url()).toContain(MOCK_API_BASE)

      await expect(page.getByText(/Publicado desde Excel/i)).toBeVisible({ timeout: 10_000 })
    },
  )

  test("out-of-vocabulary is impossible: Q_Variables uses a controlled selector", { tag: "@smoke" }, async ({ page }) => {
    await login(page)
    const nav = page.getByRole("navigation", { name: /main navigation/i })
    await nav.getByRole("link", { name: /Editor de Parámetros/i }).click()
    await expect(page).toHaveURL(/\/parametros-elegibilidad/, { timeout: 10_000 })

    await page.getByRole("tab", { name: /Q\/M_Variables/i }).click()
    // The variable selector is a combobox bound to the vocabulary — there is no
    // free-text input, so a non-existent column cannot be typed.
    const selector = page.getByTestId("Q_Vars-select-0")
    await expect(selector).toBeVisible({ timeout: 10_000 })
    await expect(selector.locator("input")).toHaveCount(0)
  })
})

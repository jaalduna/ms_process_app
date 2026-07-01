import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * JAA-613 — walkthrough of the editor extended to the remaining contract tables.
 * Covers two of the new tables end to end against the mock-server:
 *   - a rules table (Validation_Conditions): live validation (Min > Max) BLOCKS
 *     publish, the review dialog shows the before→after diff, then a fix enables
 *     the happy-path publish.
 *   - a list table (Origen_NoConsiderar): a duplicate exclusion BLOCKS publish,
 *     removing it enables the happy-path publish.
 */
test.describe("Parámetros de elegibilidad — tablas extendidas (JAA-613)", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
  })

  async function openEditor(page: import("@playwright/test").Page) {
    await login(page)
    const nav = page.getByRole("navigation", { name: /main navigation/i })
    await nav.getByRole("link", { name: /Editor de Parámetros/i }).click()
    await expect(page).toHaveURL(/\/parametros-elegibilidad/, { timeout: 10_000 })
    await expect(page.getByTestId("country-select")).toBeVisible()
  }

  test(
    "Validation_Conditions (reglas): Min>Max bloquea, diff visible, fix publica",
    { tag: "@smoke" },
    async ({ page }) => {
      await openEditor(page)

      await page.getByRole("tab", { name: /Validation_Conditions/i }).click()

      // Add a condition row, name the variable, then break the range Min > Max.
      await page.getByTestId("valcond-add").click()
      await page.getByTestId("valcond-Var-0").fill("Edad")
      await page.getByTestId("valcond-Min-0").fill("9") // Max defaults to 0 → Min > Max

      // Live validation flags the error and blocks publish.
      await expect(page.getByTestId("status-pill")).toContainText(/error/i)
      await page.getByTestId("open-review").click()
      const dialog = page.getByTestId("review-dialog")
      await expect(dialog).toBeVisible()
      await expect(page.getByTestId("dialog-error-badge")).toBeVisible()
      await expect(page.getByTestId("diff-table")).toBeVisible()
      await expect(page.getByTestId("diff-row").first()).toBeVisible()
      await expect(page.getByTestId("confirm-publish")).toBeDisabled()

      // Fix the range → valid → publish.
      await page.getByRole("button", { name: /cancelar/i }).click()
      await expect(dialog).toBeHidden()
      await page.getByTestId("valcond-Min-0").fill("0")
      await expect(page.getByTestId("status-pill")).toContainText(/válido/i)

      await page.getByTestId("open-review").click()
      await expect(page.getByTestId("confirm-publish")).toBeEnabled()
      const publishResponse = page.waitForResponse(
        (r) =>
          r.url().includes("/params/Validation_Conditions/CL/publish") &&
          r.request().method() === "POST" &&
          r.status() === 200,
      )
      await page.getByTestId("confirm-publish").click()
      const resp = await publishResponse
      const body = await resp.json()
      expect(body.parquet_path).toContain("CL/Parametros/Validation_Conditions.parquet")
      await expect(page.getByText(/Publicado: Validation_Conditions/i)).toBeVisible({ timeout: 10_000 })
    },
  )

  test(
    "Origen_NoConsiderar (lista): duplicado bloquea, quitar habilita publicar",
    { tag: "@smoke" },
    async ({ page }) => {
      await openEditor(page)

      await page.getByRole("tab", { name: /Origen_NoConsiderar/i }).click()

      // Add the same exclusion twice → duplicate error.
      const input = page.getByTestId("origen-input")
      await input.fill("100")
      await page.getByTestId("origen-add").click()
      await expect(page.getByTestId("origen-chip-0")).toBeVisible()
      await input.fill("100")
      await page.getByTestId("origen-add").click()
      await expect(page.getByTestId("origen-chip-1")).toBeVisible()

      await expect(page.getByTestId("status-pill")).toContainText(/error/i)
      await page.getByTestId("open-review").click()
      await expect(page.getByTestId("dialog-error-badge")).toBeVisible()
      await expect(page.getByTestId("confirm-publish")).toBeDisabled()
      await page.getByRole("button", { name: /cancelar/i }).click()

      // Remove the duplicate chip → valid → publish happy path.
      await page.getByTestId("origen-chip-1").getByRole("button").click()
      await expect(page.getByTestId("status-pill")).toContainText(/válido/i)

      await page.getByTestId("open-review").click()
      await expect(page.getByTestId("confirm-publish")).toBeEnabled()
      const publishResponse = page.waitForResponse(
        (r) =>
          r.url().includes("/params/Origen_NoConsiderar/CL/publish") &&
          r.request().method() === "POST" &&
          r.status() === 200,
      )
      await page.getByTestId("confirm-publish").click()
      const resp = await publishResponse
      const body = await resp.json()
      expect(body.parquet_path).toContain("CL/Parametros/Origen_NoConsiderar.parquet")
      await expect(page.getByText(/Publicado: Origen_NoConsiderar/i)).toBeVisible({ timeout: 10_000 })
    },
  )
})

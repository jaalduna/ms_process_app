import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

// JAA-583 — Universo Excel upload wizard: subir .xlsx → validar → previsualizar
// diff → publicar, against POST /weighting/params/{pais}/universo/{upload,publish}
// (mock-server contract for JAA-580). The decisive UI gate for the feature.

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

async function openUniversoWizard(page: import("@playwright/test").Page) {
  await navigateTo(page, "Pesaje", /pesaje/)
  // Pesaje → "Parametros" tab → "Universo" sub-tab (Chile is the default país).
  await page.getByRole("tab", { name: /Parametros/i }).click()
  await page.getByRole("tab", { name: /Universo/i }).click()
  await expect(page.getByTestId("universo-version")).toBeVisible({ timeout: 15_000 })
  await page.getByTestId("universo-upload-open").click()
  await expect(page.getByTestId("universo-upload-dialog")).toBeVisible()
}

test.describe("Universo Excel upload wizard (JAA-583)", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
  })

  test("a valid xlsx previews the diff and publishing reflects the new version", { tag: "@smoke" }, async ({ page }) => {
    // Baseline: seeded Universo has 6 strata rows.
    await navigateTo(page, "Pesaje", /pesaje/)
    await page.getByRole("tab", { name: /Parametros/i }).click()
    await page.getByRole("tab", { name: /Universo/i }).click()
    await expect(page.getByTestId("universo-version")).toContainText("6 filas", { timeout: 15_000 })

    await page.getByTestId("universo-upload-open").click()
    await expect(page.getByTestId("universo-upload-dialog")).toBeVisible()

    // Subir un xlsx válido → preview diff antes de publicar.
    await page.getByTestId("universo-file-input").setInputFiles({
      name: "Universo.xlsx",
      mimeType: XLSX_MIME,
      buffer: Buffer.from("binary-xlsx"),
    })

    const preview = page.getByTestId("universo-preview")
    await expect(preview).toBeVisible({ timeout: 15_000 })
    await expect(preview.getByTestId("preview-added")).toContainText("1")
    await expect(preview.getByTestId("preview-changed")).toContainText("1")

    // Publicar persiste y la tarjeta refleja la versión nueva (6 → 7 filas).
    const publishBtn = page.getByTestId("universo-publish")
    await expect(publishBtn).toBeEnabled()
    await Promise.all([
      page.waitForRequest(
        (req) => req.method() === "POST" && /\/universo\/publish(\?|$)/.test(req.url()),
      ),
      publishBtn.click(),
    ])

    await expect(page.getByTestId("universo-upload-dialog")).toBeHidden({ timeout: 15_000 })
    await expect(page.getByTestId("universo-version")).toContainText("7 filas", { timeout: 15_000 })
  })

  test("an invalid xlsx shows the failing row/column and blocks publishing", { tag: "@smoke" }, async ({ page }) => {
    await openUniversoWizard(page)

    await page.getByTestId("universo-file-input").setInputFiles({
      name: "Universo-invalid.xlsx",
      mimeType: XLSX_MIME,
      buffer: Buffer.from("bad-xlsx"),
    })

    const errors = page.getByTestId("universo-upload-errors")
    await expect(errors).toBeVisible({ timeout: 15_000 })
    await expect(errors).toContainText("fila 4 · Q2-26")

    await expect(page.getByTestId("universo-preview")).toBeHidden()
    await expect(page.getByTestId("universo-publish")).toBeDisabled()
  })
})

import path from "path"
import { fileURLToPath } from "url"
import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

// JAA-1051 — Macrocac upload/run MVP: form (tabla/país/motivo) → subir .xlsx →
// chip → Ejecutar (dry-run), against the JAA-1048 mock contract
// (docs/design/macrocac-api-contract.md). The run list/polling (JAA-1053) is
// out of scope — this only exercises the run created inline.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(__dirname, "fixtures", "correcciones_bo.xlsx")

test.describe("Macrocac Module E2E", () => {
  test.beforeEach(async ({ page }) => {
    // macrocac is off in setModuleConfig's defaults — opt in explicitly.
    await setModuleConfig(page, { macrocac: true })
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
    await navigateTo(page, "Macrocac", /macrocac/)
  })

  test("upload a valid xlsx shows a chip, then Ejecutar shows the running run", { tag: "@smoke" }, async ({ page }) => {
    await expect(page.getByTestId("macrocac-ejecutar")).toBeDisabled()

    await page.getByTestId("macrocac-file-input").setInputFiles(FIXTURE)

    const chip = page.getByTestId("macrocac-upload-chip")
    await expect(chip).toBeVisible({ timeout: 10_000 })
    await expect(chip).toContainText("correcciones_bo.xlsx")
    await expect(chip).toContainText("14 filas")

    const ejecutar = page.getByTestId("macrocac-ejecutar")
    await expect(ejecutar).toBeEnabled()
    await ejecutar.click()

    const status = page.getByTestId("macrocac-run-status")
    await expect(status).toBeVisible({ timeout: 10_000 })
    await expect(status).toContainText("running")
  })

  test("a filename with missing IdAto/Flg columns shows the missing-columns error", { tag: "@smoke" }, async ({ page }) => {
    await page.getByTestId("macrocac-file-input").setInputFiles({
      name: "correcciones-sin-idato.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("mock xlsx"),
    })

    const missing = page.getByTestId("macrocac-missing-columns")
    await expect(missing).toBeVisible({ timeout: 10_000 })
    await expect(missing).toContainText("IdAto")
    await expect(missing).toContainText("Flg")
    await expect(page.getByTestId("macrocac-ejecutar")).toBeDisabled()
    await expect(page.getByTestId("macrocac-upload-chip")).toHaveCount(0)
  })

  test("triggering a second run for the same país/tabla while one is running shows the conflict", async ({ page }) => {
    await page.getByTestId("macrocac-file-input").setInputFiles(FIXTURE)
    await expect(page.getByTestId("macrocac-upload-chip")).toBeVisible({ timeout: 10_000 })
    await page.getByTestId("macrocac-ejecutar").click()
    await expect(page.getByTestId("macrocac-run-status")).toBeVisible({ timeout: 10_000 })

    // Remove + re-upload the same país/tabla to get a second upload_id, then try
    // to run it again while the first run is still active — hits the mock's
    // (pais,tabla) dedupe rule (409 run_in_progress).
    await page.getByTestId("macrocac-upload-remove").click()
    await page.getByTestId("macrocac-file-input").setInputFiles(FIXTURE)
    await expect(page.getByTestId("macrocac-upload-chip")).toBeVisible({ timeout: 10_000 })
    await page.getByTestId("macrocac-ejecutar").click()

    const conflict = page.getByTestId("macrocac-run-conflict")
    await expect(conflict).toBeVisible({ timeout: 10_000 })
    await expect(conflict).toContainText("run_macrocac_")
  })
})

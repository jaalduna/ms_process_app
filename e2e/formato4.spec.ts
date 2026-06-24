import { test, expect } from "@playwright/test"
import type { Page, Locator } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * Formato 4 module E2E (MTR-30). Mirrors the Formato4CountryCard DOM: the
 * trigger is "Ejecutar" → AlertDialog "Confirm Formato 4" → "Confirm"; the run
 * advances through the mock pipeline to the terminal "Completado" badge. Unlike
 * MTR there is no params dialog (no config) and no detail/history sub-widgets
 * yet (those land in MTR-32/33/50).
 */

/** The country card (a [data-slot="card"]) by its visible country label. */
function card(page: Page, label: string): Locator {
  return page.locator('[data-slot="card"]', { hasText: label })
}

/** Confirm a radix AlertDialog action robustly (radix animates on open). */
async function confirmAction(page: Page, trigger: Locator, actionName: RegExp) {
  const dialog = page.getByRole("alertdialog")
  for (let attempt = 0; attempt < 4; attempt++) {
    if (!(await dialog.isVisible().catch(() => false))) {
      await trigger.click({ timeout: 8_000 }).catch(() => {})
      if (!(await dialog.isVisible({ timeout: 3_000 }).catch(() => false))) continue
    }
    await page.waitForTimeout(300)
    await dialog.getByRole("button", { name: actionName }).click({ timeout: 8_000 }).catch(() => {})
    if (await dialog.isHidden({ timeout: 5_000 }).catch(() => false)) return
  }
  throw new Error(`confirmAction(${actionName}) did not complete`)
}

/** The detail (eye) button — renders once a run leaves "pending" (status !== pending). */
function eyeButton(c: Locator): Locator {
  return c.getByRole("button", { name: /Ver detalle/ })
}

/**
 * Trigger a Formato 4 run and confirm it actually started. Mirrors the MTR
 * spec's `startMtr`: a single radix confirm can race the animation and close
 * without submitting, so retry until the success signal appears. The signal is
 * the eye button, which renders once the run leaves "pending" and survives
 * running→completed — making the trigger deterministic at retries:0.
 */
async function startFormato4(page: Page, c: Locator) {
  const eye = eyeButton(c)
  const ejecutar = c.getByRole("button", { name: /^Ejecutar$/ })
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await eye.isVisible().catch(() => false)) return
    // The card may still be loading its runs query → Ejecutar not yet enabled.
    if (!(await ejecutar.isEnabled({ timeout: 10_000 }).catch(() => false))) continue
    await confirmAction(page, ejecutar, /^Confirm$/).catch(() => {})
    if (await eye.isVisible({ timeout: 8_000 }).catch(() => false)) return
  }
  throw new Error("Formato 4 run did not start")
}

test.describe("Formato 4 Module E2E", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
  })

  test("page loads with 9 country cards", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Formato 4", /formato4/)
    const cards = page.locator('[data-slot="card"]')
    await expect(cards.first()).toBeVisible({ timeout: 10_000 })
    expect(await cards.count()).toBe(9)
  })

  test("trigger creates a run that completes", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Formato 4", /formato4/)
    const chile = card(page, "Chile")
    await startFormato4(page, chile)
    // Deterministic mock → the run reaches the "Completado" terminal badge.
    await expect(chile.getByText(/Completado/i)).toBeVisible({ timeout: 30_000 })
  })

  // MTR-32: once completed, the card exposes a Download button that streams the
  // SERVER-generated zip (mock-server /formato4/runs/:id/download fixture), NOT
  // a client-built CSV.
  // MTR-34: this is the decisive end-to-end gate (open → run a country → progress
  // reaches done → download the zip), so it runs in the @smoke project (retries:0),
  // mirroring the mtr e2e and the run wired into azure-pipelines.yml CI.
  test("completed run exposes a Download that fetches the server zip", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Formato 4", /formato4/)
    const chile = card(page, "Chile")
    await startFormato4(page, chile)
    await expect(chile.getByText(/Completado/i)).toBeVisible({ timeout: 30_000 })

    const downloadBtn = chile.getByRole("button", { name: /Descargar/ })
    await expect(downloadBtn).toBeVisible({ timeout: 10_000 })

    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 })
    await downloadBtn.click()
    const download = await downloadPromise

    // The mock streams format_4_<country>_<period>.csv.zip (Content-Disposition).
    expect(download.suggestedFilename()).toMatch(/^format_4_.*\.csv\.zip$/)
  })

  // MTR-33: once a run exists the card exposes an Eye (view detail) button that
  // opens the Formato4DetailModal — pipeline steps, generated-output grid and a
  // download — driven live by useFormato4Run.
  test("completed run: Eye opens the detail modal with pipeline + download", async ({ page }) => {
    await navigateTo(page, "Formato 4", /formato4/)
    const chile = card(page, "Chile")
    await startFormato4(page, chile)
    await expect(chile.getByText(/Completado/i)).toBeVisible({ timeout: 30_000 })

    const eye = eyeButton(chile)
    await expect(eye).toBeVisible({ timeout: 10_000 })
    await eye.click()

    const dialog = page.getByRole("dialog")
    await expect(dialog.getByText(/Formato 4 Detail/i)).toBeVisible({ timeout: 10_000 })
    // Generated-output grid surfaces the writer's metadata (row count).
    await expect(dialog.getByText(/Row Count/i)).toBeVisible({ timeout: 10_000 })

    // The modal streams the SAME server zip as the card download.
    const downloadBtn = dialog.getByRole("button", { name: /Descargar/ })
    await expect(downloadBtn).toBeVisible({ timeout: 10_000 })
    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 })
    await downloadBtn.click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^format_4_.*\.csv\.zip$/)
  })
})

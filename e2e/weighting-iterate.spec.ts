import { test, expect } from "@playwright/test"
import type { Page, Locator } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * Pesaje iterate loop E2E (JAA-423). Params are per-country/run and the card
 * drives the loop: configure → correr → revisar stats → ajustar → re-ejecutar →
 * marcar como listo (= cerrar proceso, reusing JAA-391). Reopening re-enables
 * iteration. The global header gear no longer exists.
 */

function card(page: Page, label: string): Locator {
  return page.locator('[data-slot="card"]').filter({ hasText: label }).first()
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

/** Trigger a run from the card and wait until it completes. */
async function runToCompletion(page: Page, c: Locator) {
  const ejecutar = c.getByRole("button", { name: /^(Ejecutar|Re-ejecutar)$/ })
  await expect(ejecutar).toBeEnabled({ timeout: 10_000 })
  await confirmAction(page, ejecutar, /^Confirmar$/)
  await expect(c.getByText(/Completado/i).first()).toBeVisible({ timeout: 30_000 })
}

test.describe("Pesaje iterate loop (JAA-423)", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
  })

  test("configure → run → review → adjust → re-run → mark listo → reopen", async ({ page }) => {
    await navigateTo(page, "Pesaje", /pesaje/)
    const chile = card(page, "Chile")
    await expect(chile).toBeVisible({ timeout: 15_000 })

    // ac1: per-country config control (no global gear). Configure Chile's params.
    await chile.getByRole("button", { name: "Configurar parametros" }).click()
    let dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await dialog.getByLabel("Maximo juntas marginales").fill("64")
    await page.keyboard.press("Escape")
    await expect(dialog).not.toBeVisible()

    // ac3: params are independent per country — Argentina still shows the default (50).
    const argentina = card(page, "Argentina")
    await argentina.getByRole("button", { name: "Configurar parametros" }).click()
    dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await expect(dialog.getByLabel("Maximo juntas marginales")).toHaveValue("50")
    await page.keyboard.press("Escape")
    await expect(dialog).not.toBeVisible()

    // Run Chile to completion and review the stats.
    await runToCompletion(page, chile)
    await chile.getByRole("button", { name: /ver detalle/i }).click()
    const modal = page.getByRole("dialog")
    await expect(modal).toBeVisible({ timeout: 5_000 })
    await expect(modal.getByText(/Estadisticas de Pesos/i)).toBeVisible({ timeout: 10_000 })

    // ac4: after a COMPLETED run the modal params are editable and "Re-ejecutar" works.
    const reExecBtn = modal.getByRole("button", { name: /^Re-ejecutar$/ })
    await expect(reExecBtn).toBeVisible()
    const pInput = modal.getByLabel("MAX_ROUNDS_COLAPSO")
    await expect(pInput).toBeVisible()
    await pInput.fill("70")
    // Confirm the re-run AlertDialog → it creates a new run and closes the modal.
    await confirmAction(page, reExecBtn, /^Re-ejecutar$/)
    await expect(modal).not.toBeVisible({ timeout: 8_000 })
    await runToCompletion(page, chile)

    // ac5: mark as listo closes the process and disables further runs.
    await confirmAction(page, chile.getByRole("button", { name: /^Marcar como listo$/ }), /^Marcar como listo$/)
    await expect(chile.getByRole("button", { name: /^Cerrado$/ })).toBeVisible({ timeout: 10_000 })
    await expect(chile.getByRole("button", { name: /^Re-ejecutar$/ })).toBeDisabled()
    await expect(chile.getByRole("button", { name: "Configurar parametros" })).toHaveCount(0)

    // Reopen via the badge → iteration is re-enabled.
    await confirmAction(page, chile.getByRole("button", { name: /^Cerrado$/ }), /^Abrir proceso$/)
    await expect(chile.getByRole("button", { name: /^Abierto$/ })).toBeVisible({ timeout: 10_000 })
    await expect(chile.getByRole("button", { name: /^Re-ejecutar$/ })).toBeEnabled()
    await expect(chile.getByRole("button", { name: "Configurar parametros" })).toBeVisible()
  })
})

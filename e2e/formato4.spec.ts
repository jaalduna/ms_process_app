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
    const ejecutar = chile.getByRole("button", { name: /^Ejecutar$/ })
    await expect(ejecutar).toBeEnabled({ timeout: 10_000 })
    await confirmAction(page, ejecutar, /^Confirm$/)
    // Deterministic mock → the run reaches the "Completado" terminal badge.
    await expect(chile.getByText(/Completado/i)).toBeVisible({ timeout: 30_000 })
  })
})

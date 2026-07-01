import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * Process open/close E2E (JAA-391) — exercises the per-stage, per-country
 * open/close toggle wired to the mock `/processes` endpoints:
 *   - the ProcessStatusBadge reflects the open/closed state with attribution
 *   - closing a process disables the stage's "start a new run" trigger
 *   - opening/closing updates the badge + attribution live (no reload)
 */

/**
 * Click an open/close badge (an AlertDialog trigger) and confirm the dialog
 * action — deterministically, so it passes on the first attempt.
 *
 * Two flakiness sources are handled: (1) the badge button is briefly
 * `disabled` while a previous mutation is in flight (`setStatus.isPending`),
 * so we wait for it to be enabled before clicking; (2) radix dialogs animate
 * on open, so we assert the dialog is visible and let it settle before
 * clicking the action. On any miss we Escape-reset to a known closed-dialog
 * state and retry from scratch (avoids trigger/action click oscillation).
 */
async function toggleProcess(
  page: import("@playwright/test").Page,
  trigger: import("@playwright/test").Locator,
  actionName: RegExp,
) {
  const dialog = page.getByRole("alertdialog")
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await expect(trigger).toBeEnabled({ timeout: 8_000 })
      await trigger.click({ timeout: 8_000 })
      await expect(dialog).toBeVisible({ timeout: 5_000 })
      await page.waitForTimeout(400) // let the open animation settle
      await dialog.getByRole("button", { name: actionName }).click({ timeout: 8_000 })
      await expect(dialog).toBeHidden({ timeout: 6_000 })
      return
    } catch {
      // A swallowed click can leave the dialog open; reset to a known state.
      await page.keyboard.press("Escape").catch(() => {})
      await page.waitForTimeout(250)
    }
  }
  throw new Error(`toggleProcess(${actionName}) did not complete`)
}

test.describe("Process open/close E2E (JAA-391)", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
  })

  test("open/close a country process updates the badge, attribution and run trigger", async ({ page }) => {
    await navigateTo(page, "Precios", /precios/)

    // Chile's precios process is open by default (no attribution yet).
    const card = page.locator('[aria-label="View price validation history for Chile"]')
    await expect(card).toBeVisible({ timeout: 15_000 })

    const openBadge = card.getByRole("button", { name: /^Abierto$/ })
    await expect(openBadge).toBeVisible()

    // While open, the "Validar" (start a new run) button is enabled.
    await expect(card.getByRole("button", { name: /^Validar$/ })).toBeEnabled()

    // Close the process → badge flips to "Cerrado" with attribution, live.
    await toggleProcess(page, openBadge, /^Cerrar proceso$/)
    await expect(card.getByRole("button", { name: /^Cerrado$/ })).toBeVisible({ timeout: 10_000 })
    await expect(card.getByText(/por Dev User/)).toBeVisible()

    // Closed → the run trigger is disabled (a closed process blocks new runs).
    await expect(card.getByRole("button", { name: /^Validar$/ })).toBeDisabled()

    // Reopen → badge flips back to "Abierto", attribution still shown, trigger re-enabled.
    const closedBadge = card.getByRole("button", { name: /^Cerrado$/ })
    await toggleProcess(page, closedBadge, /^Abrir proceso$/)
    await expect(card.getByRole("button", { name: /^Abierto$/ })).toBeVisible({ timeout: 10_000 })
    await expect(card.getByText(/por Dev User/)).toBeVisible()
    await expect(card.getByRole("button", { name: /^Validar$/ })).toBeEnabled()
  })
})

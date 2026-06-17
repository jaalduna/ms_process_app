import { test, expect } from "@playwright/test"
import type { Page, Locator } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * Precios (price validation) module E2E. Mirrors the real PricesCountryCard DOM:
 * the whole card is a role=button (aria "View price validation history for X")
 * that opens the history modal; the trigger/cancel/detail controls live inside
 * it. Trigger = "Validar" → AlertDialog "Confirm" → results_ready ("Resultados
 * listos"); the outlier table + Approve live in the detail modal (eye button).
 */

/** The page's current period (previous month, mirrors PreciosPage.currentPeriod). */
function currentPeriod(): number {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return Number(`${prev.getFullYear()}${String(prev.getMonth() + 1).padStart(2, "0")}`)
}

/** The country card (a role=button) by its visible label. */
function card(page: Page, label: string): Locator {
  return page.locator(`[aria-label="View price validation history for ${label}"]`)
}

/**
 * Confirm a radix AlertDialog action robustly (radix dialogs animate on open, so
 * a too-early action click — or the trigger click itself — is sometimes
 * swallowed). Mirrors the helper used in eligibility.spec.ts / calibration.spec.ts.
 */
async function confirmAction(page: Page, trigger: Locator, actionName: RegExp) {
  const dialog = page.getByRole("alertdialog")
  for (let attempt = 0; attempt < 4; attempt++) {
    if (!(await dialog.isVisible().catch(() => false))) {
      await trigger.click({ timeout: 8_000 }).catch(() => {})
      if (!(await dialog.isVisible({ timeout: 3_000 }).catch(() => false))) continue
    }
    await page.waitForTimeout(300) // let the open animation settle
    await dialog.getByRole("button", { name: actionName }).click({ timeout: 8_000 }).catch(() => {})
    if (await dialog.isHidden({ timeout: 5_000 }).catch(() => false)) return
  }
  throw new Error(`confirmAction(${actionName}) did not complete`)
}

/**
 * Trigger a validation on a country card and confirm a run now exists. Success
 * signal = the persistent "View validation details" (eye) button, which renders
 * once a run exists and survives the running→results_ready transition. (Checking
 * the Validar button is unreliable: it reappears at results_ready, and a fast
 * run can settle the confirm dialog before confirmAction's own race check.)
 */
async function startValidation(page: Page, c: Locator) {
  const eye = c.getByRole("button", { name: /view validation details/i })
  const validar = c.getByRole("button", { name: /^Validar$/ })
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await eye.isVisible().catch(() => false)) return // a run already exists
    // The card may still be loading its runs query → Validar not yet rendered.
    if (!(await validar.isEnabled({ timeout: 10_000 }).catch(() => false))) continue
    await confirmAction(page, validar, /^Confirm$/).catch(() => {})
    if (await eye.isVisible({ timeout: 8_000 }).catch(() => false)) return
  }
  throw new Error("prices validation did not start")
}

test.describe("Prices Module E2E", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
  })

  test("page loads with 9 country cards", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Precios", /precios/)
    const cards = page.locator('[data-slot="card"]')
    await expect(cards.first()).toBeVisible({ timeout: 10_000 })
    expect(await cards.count()).toBe(9)
  })

  test("trigger validation runs to results_ready", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Precios", /precios/)
    const chile = card(page, "Chile")
    await startValidation(page, chile)

    // results_ready → the amber "Resultados listos" badge + the detail (eye) button.
    await expect(chile.getByText(/Resultados listos/i)).toBeVisible({ timeout: 30_000 })
    await expect(chile.getByRole("button", { name: /view validation details/i })).toBeVisible()
  })

  test("completed run shows outlier results table in the detail modal", async ({ page }) => {
    await navigateTo(page, "Precios", /precios/)
    const chile = card(page, "Chile")
    await startValidation(page, chile)
    await expect(chile.getByText(/Resultados listos/i)).toBeVisible({ timeout: 30_000 })

    await chile.getByRole("button", { name: /view validation details/i }).click()
    const modal = page.getByRole("dialog")
    await expect(modal).toBeVisible({ timeout: 5_000 })
    await expect(modal.getByText(/Price Validation Detail/i)).toBeVisible()
    await expect(modal.getByText(/Outlier Results/i)).toBeVisible()
    // The outlier table carries the expected column headers.
    await expect(modal.getByRole("columnheader", { name: "Product" })).toBeVisible()
    await expect(modal.getByRole("columnheader", { name: "Deviation %" })).toBeVisible()
  })

  test("approval action updates status to approved", async ({ page }) => {
    await navigateTo(page, "Precios", /precios/)
    const chile = card(page, "Chile")
    await startValidation(page, chile)
    await expect(chile.getByText(/Resultados listos/i)).toBeVisible({ timeout: 30_000 })

    await chile.getByRole("button", { name: /view validation details/i }).click()
    const modal = page.getByRole("dialog")
    await expect(modal).toBeVisible({ timeout: 5_000 })

    // Approve lives in the modal and opens its own confirm AlertDialog.
    await confirmAction(page, modal.getByRole("button", { name: /^Approve$/ }), /^Approve$/)

    // The modal holds a stale run snapshot, so close it and assert the card's
    // status badge flipped to "Aprobado" (the runs query is invalidated on approve).
    await page.keyboard.press("Escape")
    await expect(modal).toBeHidden({ timeout: 5_000 })
    await expect(chile.getByText(/Aprobado/i)).toBeVisible({ timeout: 10_000 })
  })

  test("cancel stops a running validation and shows cancelled status", async ({ page }) => {
    await navigateTo(page, "Precios", /precios/)
    const period = currentPeriod()

    // Create a run via API WITHOUT executing it: it stays "pending" (which the
    // card treats as active → Stop available) and never auto-completes, so the
    // cancel is deterministic under the fast mock (an executed run would finish
    // before a UI click could land).
    await page.request.post(`${MOCK_API_BASE}/prices/runs`, { data: { country: "chile", period } })

    // Re-mount via client-side nav so the runs query picks up the pending run.
    await navigateTo(page, "Overview", /overview/)
    await navigateTo(page, "Precios", /precios/)

    const chile = card(page, "Chile")
    const stop = chile.getByRole("button", { name: /stop validation/i })
    await expect(stop).toBeVisible({ timeout: 15_000 })
    await confirmAction(page, stop, /^Stop$/)

    await expect(chile.getByText(/Cancelado/i)).toBeVisible({ timeout: 10_000 })
  })

  test("failed run shows error message and retry action", async ({ page }) => {
    await navigateTo(page, "Precios", /precios/)
    const period = currentPeriod()

    // Create a run via API, force it to fail at the outlier step, then execute.
    const createRes = await page.request.post(`${MOCK_API_BASE}/prices/runs`, {
      data: { country: "chile", period },
    })
    const run = await createRes.json()
    await page.request.post(`${MOCK_API_BASE}/test/fail-run/${run.run_id}`, {
      data: { step: "detect_outliers" },
    })
    await page.request.post(`${MOCK_API_BASE}/prices/runs/${run.run_id}/execute`)

    // Re-mount the page via client-side nav (a hard reload would drop the
    // in-memory dev auth) so the runs query refetches the failed run.
    await navigateTo(page, "Overview", /overview/)
    await navigateTo(page, "Precios", /precios/)

    const chile = card(page, "Chile")
    await expect(chile.getByText(/^Error$/)).toBeVisible({ timeout: 15_000 })
    await expect(chile.getByRole("button", { name: /Reintentar/i })).toBeVisible({ timeout: 5_000 })
  })

  test("history modal lists past runs for a country", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Precios", /precios/)
    const chile = card(page, "Chile")
    await expect(chile).toBeVisible({ timeout: 10_000 })

    // Clicking the card body (not an action button) opens the history modal,
    // which lists the mock-seeded approved run for the country.
    await chile.locator('[data-slot="card-title"]').click()
    const modal = page.getByRole("dialog")
    await expect(modal).toBeVisible({ timeout: 5_000 })
    await expect(modal.getByText(/Price Validation History/i)).toBeVisible()
    await expect(modal.getByText(/Showing \d+ most recent/i)).toBeVisible({ timeout: 5_000 })
  })
})

import { test, expect } from "@playwright/test"
import type { Page, Locator } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * MTR module E2E. Mirrors the real MtrCountryCard DOM: the card is a role=button
 * ("View MTR history for X") opening the history modal; trigger = "Ejecutar" →
 * AlertDialog "Confirm MTR" → "Confirm"; processing shows "Running..." + "Stop".
 * Completed runs go to the "Completado" badge; the imputation summary + the
 * failure "Retry" action live in the detail modal (the eye button).
 */

/** The page's current period (previous month, mirrors the MTR page). */
function currentPeriod(): number {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return Number(`${prev.getFullYear()}${String(prev.getMonth() + 1).padStart(2, "0")}`)
}

/** The country card (a role=button) by its visible label. */
function card(page: Page, label: string): Locator {
  return page.locator(`[aria-label="View MTR history for ${label}"]`)
}

/** The detail (eye) button inside a card — it carries no accessible name. */
function eyeButton(c: Locator): Locator {
  return c.locator("button:has(.lucide-eye)")
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

/**
 * Trigger an MTR run and confirm it started. Success signal = the eye button,
 * which renders once a run leaves "pending" and survives running→completed.
 */
async function startMtr(page: Page, c: Locator) {
  const eye = eyeButton(c)
  const ejecutar = c.getByRole("button", { name: /^Ejecutar$/ })
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await eye.isVisible().catch(() => false)) return
    // The card may still be loading its runs query → Ejecutar not yet rendered.
    if (!(await ejecutar.isEnabled({ timeout: 10_000 }).catch(() => false))) continue
    await confirmAction(page, ejecutar, /^Confirm$/).catch(() => {})
    if (await eye.isVisible({ timeout: 8_000 }).catch(() => false)) return
  }
  throw new Error("MTR run did not start")
}

test.describe("MTR Module E2E", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
  })

  test("page loads with 9 country cards", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "MTR", /mtr/)
    const cards = page.locator('[data-slot="card"]')
    await expect(cards.first()).toBeVisible({ timeout: 10_000 })
    expect(await cards.count()).toBe(9)
  })

  test("trigger creates a run that completes", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "MTR", /mtr/)
    const chile = card(page, "Chile")
    await startMtr(page, chile)
    // Deterministic mock → the run reaches the "Completado" terminal badge.
    await expect(chile.getByText(/Completado/i)).toBeVisible({ timeout: 30_000 })
  })

  test("completed run shows imputation results summary", async ({ page }) => {
    await navigateTo(page, "MTR", /mtr/)
    const chile = card(page, "Chile")
    await startMtr(page, chile)
    await expect(chile.getByText(/Completado/i)).toBeVisible({ timeout: 30_000 })

    await eyeButton(chile).click()
    const modal = page.getByRole("dialog")
    await expect(modal).toBeVisible({ timeout: 5_000 })
    await expect(modal.getByText(/MTR Detail/i)).toBeVisible()
    // The imputation summary block + its metrics ("Imputation Results" appears
    // both in the dialog description and as the section label → match exactly).
    await expect(modal.getByText("Imputation Results", { exact: true })).toBeVisible()
    await expect(modal.getByText("Total Targets")).toBeVisible()
    await expect(modal.getByText("Quality Score")).toBeVisible()
  })

  test("failed run shows error details and retry action", async ({ page }) => {
    await navigateTo(page, "MTR", /mtr/)
    const period = currentPeriod()

    // Create + force-fail + execute via API for a deterministic failed run.
    const createRes = await page.request.post(`${MOCK_API_BASE}/mtr/runs`, {
      data: { country: "chile", period },
    })
    const run = await createRes.json()
    await page.request.post(`${MOCK_API_BASE}/test/fail-run/${run.run_id}`, {
      data: { step: "compute_imputations" },
    })
    await page.request.post(`${MOCK_API_BASE}/mtr/runs/${run.run_id}/execute`)

    // Re-mount via client-side nav (a hard reload drops the in-memory dev auth).
    await navigateTo(page, "Overview", /overview/)
    await navigateTo(page, "MTR", /mtr/)

    const chile = card(page, "Chile")
    await expect(chile.getByText(/^Error$/)).toBeVisible({ timeout: 15_000 })

    // The retry action lives in the detail modal.
    await eyeButton(chile).click()
    const modal = page.getByRole("dialog")
    await expect(modal).toBeVisible({ timeout: 5_000 })
    await expect(modal.getByRole("button", { name: /^Retry$/ })).toBeVisible({ timeout: 5_000 })
  })
})

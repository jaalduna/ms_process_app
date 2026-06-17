import { test, expect } from "@playwright/test"
import type { Page, Locator } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * Calibración module E2E — exercises the deliberate per-country mock spread
 * (full / partial / no availability, seeded sync+calibration history) and the
 * deterministic trigger outcomes (DEMO_CALIBRATION_OUTCOMES in sync.js), and
 * guards the action-row layout: while a job runs the row holds three controls
 * (Running + Stop + Ver detalle) which must wrap instead of clipping the eye
 * button against the card border.
 */

/**
 * Confirm a radix AlertDialog action robustly (radix dialogs animate on open,
 * so a too-early action click — or the trigger click itself — is sometimes
 * swallowed). Mirrors the helper used in eligibility.spec.ts.
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

/** The card for a given country (matched by its visible name). The card text
 *  glues the label to the next token (e.g. "MexicoCalibración…"), so match on a
 *  plain substring rather than a \b word-boundary regex. */
function countryCard(page: Page, name: string): Locator {
  return page.locator('[data-slot="card"]').filter({ hasText: name }).first()
}

test.describe("Calibración Module E2E", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
    await navigateTo(page, "Calibración", /calibration/)
    await expect(page.locator('[data-slot="card"]').first()).toBeVisible({ timeout: 10_000 })
  })

  test("renders 9 country cards with a varied availability spread", { tag: "@smoke" }, async ({ page }) => {
    const cards = page.locator('[data-slot="card"]')
    expect(await cards.count()).toBe(9)

    // Full availability → Calibrar enabled (Mexico is seeded full + forced pass).
    await expect(countryCard(page, "Mexico").getByRole("button", { name: /^Calibrar$/ })).toBeEnabled()
    // No availability → Calibrar disabled (Ecuador is seeded with no data).
    await expect(countryCard(page, "Ecuador").getByRole("button", { name: /^Calibrar$/ })).toBeDisabled()
  })

  // @flow (not @smoke): this triggers a run AND opens the detail modal — the
  // heaviest interaction here. Under full-suite load a cold vite route-compile can
  // reload the SPA (dropping the in-memory dev auth), which @smoke's retries:0
  // can't absorb; @flow's retries do. The pure layout/wrap assertion also lives
  // in vitest (WeightingCountryCard "action row wraps" + DependencyIndicator).
  test("running action row does not clip 'Ver detalle' (eye button)", async ({ page }) => {
    // Mexico: full availability + deterministic "pass" → a long-enough running
    // window to observe the three-control action row (Running + Stop + eye).
    const card = countryCard(page, "Mexico")
    const calibrar = card.getByRole("button", { name: /^Calibrar$/ })
    const eye = card.getByRole("button", { name: /view calibration details/i })
    const stop = card.getByRole("button", { name: /stop calibration/i })

    // Trigger the run. confirmAction can win the start but lose its own
    // dialog-hidden race and throw, so tolerate that — the real success signal
    // is the running-state controls (eye + stop) appearing below.
    await expect(calibrar).toBeEnabled()
    await confirmAction(page, calibrar, /^Confirm$/).catch(() => {})

    // Eye (Ver detalle) and Stop both appear once the job is running.
    await expect(eye).toBeVisible({ timeout: 15_000 })
    await expect(stop).toBeVisible({ timeout: 15_000 })

    // The eye button must lie fully within the card's right edge — i.e. the
    // action row wrapped instead of overflowing/clipping it. (1px tolerance.)
    const cardBox = await card.boundingBox()
    const eyeBox = await eye.boundingBox()
    expect(cardBox).not.toBeNull()
    expect(eyeBox).not.toBeNull()
    expect(eyeBox!.x + eyeBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1)
    expect(eyeBox!.x).toBeGreaterThanOrEqual(cardBox!.x - 1)

    // And it is hit-testable: a normal click (not dispatchEvent) opens the modal.
    await eye.click()
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 })
  })
})

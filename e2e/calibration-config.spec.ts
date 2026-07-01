import { test, expect } from "@playwright/test"
import type { Page } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * JAA-645 — CalibrationConfigDialog wired to the shared backend config
 * (GET/PUT /config/processes/calibration, JAA-642). Proves the calibration
 * defaults are persisted server-side (NOT localStorage) and therefore shared
 * between sessions: admin opens the dialog → changes lookback_months → Guardar
 * → reload ⇒ the new value is still there; a brand-new browser context (another
 * user/session) reads the same value.
 */

/** Open the Calibration settings dialog and return its lookback_months input. */
async function openLookbackInput(page: Page) {
  await page.getByRole("button", { name: /Calibration settings/i }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  return dialog.getByRole("spinbutton").first()
}

test.describe("Calibration shared config — persists server-side across reload/sessions", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
  })

  test("admin saves lookback_months, value persists after reload and in a new session", {
    tag: "@smoke",
  }, async ({
    page,
    browser,
  }) => {
    await login(page)
    await navigateTo(page, "Calibración", /\/calibration/)

    // Default (no row yet) is the built-in 36 months.
    let lookback = await openLookbackInput(page)
    await expect(lookback).toHaveValue("36")

    // Change it to 18 and save — this PUTs the shared config.
    const putResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/config/processes/calibration") &&
        r.request().method() === "PUT" &&
        r.status() === 200,
    )
    await lookback.fill("18")
    await page.getByRole("dialog").getByRole("button", { name: /^Guardar$/i }).click()
    const resp = await putResponse
    // Came from the mock origin (no real backend running) and carries the value.
    expect(resp.url()).toContain(MOCK_API_BASE)
    const body = await resp.json()
    expect(body.config.lookback_months).toBe(18)

    // --- fresh full reload of the app (login() does page.goto to the root, so
    //     the SPA + its React Query cache are torn down and rebuilt): the value
    //     persists because it is re-hydrated from the backend GET, not any
    //     client-side state. Dev auth lives in React state only, so a reload
    //     requires re-authenticating — login() handles that. --------------------
    await login(page)
    await navigateTo(page, "Calibración", /\/calibration/)
    lookback = await openLookbackInput(page)
    await expect(lookback).toHaveValue("18")

    // --- another session (new browser context = different user) sees the same
    //     shared default -------------------------------------------------------
    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await setModuleConfig(page2, {})
    await login(page2)
    await navigateTo(page2, "Calibración", /\/calibration/)
    const lookback2 = await openLookbackInput(page2)
    await expect(lookback2).toHaveValue("18")
    await ctx2.close()
  })
})

import { test, expect } from "@playwright/test"
import type { Page } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * JAA-644 — MtrConfigDialog wired to the shared backend config
 * (GET/PUT /config/processes/mtr, JAA-642). Proves the defaults are persisted
 * server-side (NOT localStorage) and therefore shared between sessions:
 *   admin opens the dialog → changes target_threshold → Guardar → reload ⇒ the
 *   new value is still there; a brand-new browser context (another user/session)
 *   reads the same value.
 */

/** Open the MTR settings dialog and return its first number input (target_threshold). */
async function openConfigThreshold(page: Page) {
  await page.getByRole("button", { name: /MTR settings/i }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  return dialog.getByRole("spinbutton").first()
}

test.describe("MTR shared config — persists server-side across reload/sessions", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
  })

  test("admin saves target_threshold, value persists after reload and in a new session", {
    tag: "@smoke",
  }, async ({
    page,
    browser,
  }) => {
    await login(page)
    await navigateTo(page, "MTR", /\/mtr/)

    // Default (no row yet) is the built-in 0.85.
    let threshold = await openConfigThreshold(page)
    await expect(threshold).toHaveValue("0.85")

    // Change it to 0.93 and save — this PUTs the shared config.
    const putResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/config/processes/mtr") &&
        r.request().method() === "PUT" &&
        r.status() === 200,
    )
    await threshold.fill("0.93")
    await page.getByRole("dialog").getByRole("button", { name: /^Guardar$/i }).click()
    const resp = await putResponse
    // Came from the mock origin (no real backend running) and carries the value.
    expect(resp.url()).toContain(MOCK_API_BASE)
    const body = await resp.json()
    expect(body.config.target_threshold).toBe(0.93)

    // --- fresh full reload of the app (login() does page.goto to the root, so
    //     the SPA + its React Query cache are torn down and rebuilt): the value
    //     persists because it is re-hydrated from the backend GET, not any
    //     client-side state. Dev auth lives in React state only, so a reload
    //     requires re-authenticating — login() handles that. --------------------
    await login(page)
    await navigateTo(page, "MTR", /\/mtr/)
    threshold = await openConfigThreshold(page)
    await expect(threshold).toHaveValue("0.93")

    // --- another session (new browser context = different user) sees the same
    //     shared default -------------------------------------------------------
    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await setModuleConfig(page2, {})
    await login(page2)
    await navigateTo(page2, "MTR", /\/mtr/)
    const threshold2 = await openConfigThreshold(page2)
    await expect(threshold2).toHaveValue("0.93")
    await ctx2.close()
  })
})

import { test, expect } from "@playwright/test"
import type { Page } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * JAA-646 — PricesConfigDialog wired to the shared backend config
 * (GET/PUT /config/processes/prices, JAA-642). Proves the prices defaults
 * (dummy placeholder params) are persisted server-side (NOT localStorage) and
 * therefore shared between sessions: admin opens the dialog → changes
 * placeholder_param_1 → Guardar → reload ⇒ the new value is still there; a
 * brand-new browser context (another user/session) reads the same value.
 */

/** Open the Prices settings dialog and return its placeholder_param_1 input. */
async function openParamInput(page: Page) {
  await page.getByRole("button", { name: /Prices settings/i }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  return dialog.getByRole("spinbutton").first()
}

test.describe("Prices shared config — persists server-side across reload/sessions", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
  })

  test("admin saves placeholder_param_1, value persists after reload and in a new session", {
    tag: "@smoke",
  }, async ({
    page,
    browser,
  }) => {
    await login(page)
    await navigateTo(page, "Precios", /\/precios/)

    // Default (no row yet) is the built-in dummy 0.
    let param = await openParamInput(page)
    await expect(param).toHaveValue("0")

    // Change it to 42 and save — this PUTs the shared config.
    const putResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/config/processes/prices") &&
        r.request().method() === "PUT" &&
        r.status() === 200,
    )
    await param.fill("42")
    await page.getByRole("dialog").getByRole("button", { name: /^Guardar$/i }).click()
    const resp = await putResponse
    // Came from the mock origin (no real backend running) and carries the value.
    expect(resp.url()).toContain(MOCK_API_BASE)
    const body = await resp.json()
    expect(body.config.placeholder_param_1).toBe(42)

    // --- fresh full reload of the app (login() does page.goto to the root, so
    //     the SPA + its React Query cache are torn down and rebuilt): the value
    //     persists because it is re-hydrated from the backend GET, not any
    //     client-side state. Dev auth lives in React state only, so a reload
    //     requires re-authenticating — login() handles that. --------------------
    await login(page)
    await navigateTo(page, "Precios", /\/precios/)
    param = await openParamInput(page)
    await expect(param).toHaveValue("42")

    // --- another session (new browser context = different user) sees the same
    //     shared default -------------------------------------------------------
    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await setModuleConfig(page2, {})
    await login(page2)
    await navigateTo(page2, "Precios", /\/precios/)
    const param2 = await openParamInput(page2)
    await expect(param2).toHaveValue("42")
    await ctx2.close()
  })
})

import { test, expect } from "@playwright/test"
import type { Page } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * JAA-667 — per-country calibration `group_by` persisted as shared config under a
 * per-country *scope* (process=calibration, scope=<country code>), via the same
 * process_config backend as JAA-645. Proves the value is server-side (NOT
 * localStorage) and shared between sessions: an admin edits Chile's group_by →
 * Guardar → reload ⇒ still there; a brand-new browser context (another user /
 * session) reads the same shared value. Editing one country must not affect the
 * built-in defaults of another.
 */

const COUNTRY = "Chile"
// Built-in DEFAULT_GROUP_BY["chile"] from src/modules/calibracion/types.ts.
const CHILE_DEFAULT = "IdProduto_Calib;IdProduto_Calib,Region"
const CHILE_EDITED = "IdProduto_Calib,Region_A"

/** Open a country's group_by settings dialog and return its text input. */
async function openGroupByInput(page: Page, country = COUNTRY) {
  await page.getByRole("button", { name: `Group by settings for ${country}` }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  return dialog.getByRole("textbox").first()
}

test.describe("Calibration per-country group_by — persists server-side across reload/sessions", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
  })

  test(
    "admin saves Chile group_by, value persists after reload and in a new session",
    { tag: "@smoke" },
    async ({ page, browser }) => {
      await login(page)
      await navigateTo(page, "Calibración", /\/calibration/)

      // No row yet → the dialog shows the built-in DEFAULT_GROUP_BY for Chile.
      let input = await openGroupByInput(page)
      await expect(input).toHaveValue(CHILE_DEFAULT)

      // Change it and save — PUTs the shared config at scope=chile.
      const putResponse = page.waitForResponse(
        (r) =>
          r.url().includes("/config/processes/calibration") &&
          r.url().includes("scope=chile") &&
          r.request().method() === "PUT" &&
          r.status() === 200,
      )
      await input.fill(CHILE_EDITED)
      await page.getByRole("dialog").getByRole("button", { name: /^Guardar$/i }).click()
      const resp = await putResponse
      expect(resp.url()).toContain(MOCK_API_BASE)
      const body = await resp.json()
      expect(body.scope).toBe("chile")
      expect(body.config.group_by).toBe(CHILE_EDITED)

      // Fresh full reload (login() goes to root, tearing down the SPA + React
      // Query cache): the value persists because it re-hydrates from the backend
      // GET, not any client-side state.
      await login(page)
      await navigateTo(page, "Calibración", /\/calibration/)
      input = await openGroupByInput(page)
      await expect(input).toHaveValue(CHILE_EDITED)

      // Another session (new browser context = different user) sees the same value.
      const ctx2 = await browser.newContext()
      const page2 = await ctx2.newPage()
      await setModuleConfig(page2, {})
      await login(page2)
      await navigateTo(page2, "Calibración", /\/calibration/)
      const input2 = await openGroupByInput(page2)
      await expect(input2).toHaveValue(CHILE_EDITED)
      await ctx2.close()
    },
  )

  test("editing one country's group_by does not change another country's default", async ({
    page,
  }) => {
    await login(page)
    await navigateTo(page, "Calibración", /\/calibration/)

    // Save a custom group_by for Chile.
    const input = await openGroupByInput(page)
    await input.fill(CHILE_EDITED)
    const putResponse = page.waitForResponse(
      (r) =>
        r.url().includes("scope=chile") &&
        r.request().method() === "PUT" &&
        r.status() === 200,
    )
    await page.getByRole("dialog").getByRole("button", { name: /^Guardar$/i }).click()
    await putResponse
    await page.keyboard.press("Escape")

    // Peru still shows its own built-in default (scopes are isolated).
    const peruInput = await openGroupByInput(page, "Peru")
    await expect(peruInput).toHaveValue("IdProduto_Calib;IdProduto_Calib,Region")
  })
})

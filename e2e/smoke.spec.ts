import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { setModuleConfig, MOCK_API_BASE, MOCK_ORIGIN } from "./helpers/config"

/**
 * Smoke tests — fast, browser-level sanity checks against the post-rebrand app
 * (MS Process App, Overview landing). Replaces the old sync-centric "Trigger
 * Data Sync" dashboard smoke tests (JAA-411). Heavier component-level assertions
 * (card counts, button enable/disable) live in vitest; this file only guards the
 * shell: login page, sign-in → Overview landing, nav, and API reachability.
 */
test.describe("Smoke Tests", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
  })

  test("frontend loads and shows the login page", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/ms-process-app/")
    await expect(page.getByRole("heading", { name: "MS Process App" })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole("button", { name: /continue \(dev\)|sign in with/i })).toBeVisible()
  })

  test("can sign in with dev auth and land on Overview", { tag: "@smoke" }, async ({ page }) => {
    await login(page)
    // Default landing after auth is the Overview pipeline page.
    await expect(page).toHaveURL(/\/overview/, { timeout: 15_000 })
    await expect(page.getByRole("heading", { name: /Country Pipeline Overview/i })).toBeVisible({
      timeout: 10_000,
    })
  })

  test("overview shows the per-country pipeline table", { tag: "@smoke" }, async ({ page }) => {
    await login(page)
    await expect(page).toHaveURL(/\/overview/, { timeout: 15_000 })

    // The overview table has a stage column per pipeline module and one row per
    // country (the mock seeds 9 countries).
    const table = page.getByRole("table")
    await expect(table).toBeVisible({ timeout: 10_000 })
    await expect(table.getByRole("columnheader", { name: "Precios" })).toBeVisible()
    await expect(table.getByRole("columnheader", { name: "Calibración" })).toBeVisible()
    const rows = table.locator("tbody tr")
    expect(await rows.count()).toBe(9)
  })

  test("main navigation exposes the pipeline modules", { tag: "@smoke" }, async ({ page }) => {
    await login(page)
    const nav = page.getByRole("navigation", { name: /main navigation/i })
    await expect(nav).toBeVisible({ timeout: 10_000 })
    for (const label of ["Overview", "Precios", "Elegibilidad", "Pesaje", "Calibración", "MTR", "Trazabilidad"]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible()
    }
    // The old sync module is disabled by default → no Sync nav item.
    await expect(nav.getByRole("link", { name: /^sync$/i })).toHaveCount(0)
  })

  test("backend API health endpoint is reachable", { tag: "@smoke" }, async ({ page }) => {
    const response = await page.request.get(`${MOCK_ORIGIN}/health/live`)
    expect(response.ok()).toBeTruthy()
    const body = await response.json()
    expect(body.status).toBe("ok")
  })
})

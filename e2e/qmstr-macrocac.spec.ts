import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * Smoke coverage for the QMS-TR page (a copy of MTR at /qms-tr), the retained
 * MTR page (/mtr), and the Macrocac placeholder (/macrocac, on-demand publish to
 * productive SQL tables). Nav-click navigation is used instead of page.goto
 * because the dev auth state is in-memory and a hard reload logs the session out.
 */
test.describe("QMS-TR / MTR / Macrocac", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, { mtr: true, qmstr: true, macrocac: true })
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
  })

  test("new nav items are present alongside MTR", { tag: "@smoke" }, async ({ page }) => {
    const nav = page.getByRole("navigation", { name: /main navigation/i })
    await expect(nav).toBeVisible({ timeout: 10_000 })
    await expect(nav.getByRole("link", { name: "MTR", exact: true })).toBeVisible()
    await expect(nav.getByRole("link", { name: "QMS-TR", exact: true })).toBeVisible()
    await expect(nav.getByRole("link", { name: "Macrocac", exact: true })).toBeVisible()
  })

  test("QMS-TR page renders the MTR country grid under its own heading", { tag: "@smoke" }, async ({ page }) => {
    const nav = page.getByRole("navigation", { name: /main navigation/i })
    await nav.getByRole("link", { name: "QMS-TR", exact: true }).click()
    await expect(page).toHaveURL(/\/qms-tr$/, { timeout: 10_000 })
    await expect(page.getByRole("heading", { name: "QMS-TR", exact: true })).toBeVisible({ timeout: 10_000 })
    // Same content as MTR: at least one country card with the trigger button.
    await expect(page.getByRole("button", { name: /^Ejecutar$/ }).first()).toBeVisible({ timeout: 10_000 })
  })

  test("MTR page is still reachable at /mtr with its own heading", { tag: "@smoke" }, async ({ page }) => {
    const nav = page.getByRole("navigation", { name: /main navigation/i })
    await nav.getByRole("link", { name: "MTR", exact: true }).click()
    await expect(page).toHaveURL(/\/mtr$/, { timeout: 10_000 })
    await expect(page.getByRole("heading", { name: "MTR", exact: true })).toBeVisible({ timeout: 10_000 })
  })

  test("Macrocac shows the placeholder describing the productive-table upload", { tag: "@smoke" }, async ({ page }) => {
    const nav = page.getByRole("navigation", { name: /main navigation/i })
    await nav.getByRole("link", { name: "Macrocac", exact: true }).click()
    await expect(page).toHaveURL(/\/macrocac$/, { timeout: 10_000 })
    await expect(page.getByRole("heading", { name: "Macrocac", exact: true })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText("Próximamente")).toBeVisible()
    await expect(page.getByText(/tablas productivas/i).first()).toBeVisible()
  })
})

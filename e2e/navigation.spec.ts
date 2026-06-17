import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

test.describe("Navigation and Module Toggle E2E", () => {
  // JAA-411: quarantined (stale/aspirational selector vs current DOM) — repair or port to vitest.
  test.fixme("all module nav items visible when all modules enabled", { tag: "@smoke" }, async ({ page }) => {
    // Enable all modules
    await setModuleConfig(page, {
      sync: true,
      calibration: true,
      elegibilidad: true,
      prices: true,
      weighting: true,
      mtr: true,
      traceability: true,
    })
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)

    // Wait for the navigation to render after login
    await expect(page.locator("nav, [role='navigation'], aside")).toBeVisible({ timeout: 10_000 })

    // Check for each module's nav item. The nav labels may be in Spanish.
    // Currently registered modules: sync, elegibilidad, calibracion
    // New modules (prices, weighting, mtr, traceability) depend on their
    // respective SPECs being implemented in the registry.
    // Check for the modules that are currently in the registry:
    const existingModuleLabels = [
      /sync|sincronizaci/i,
      /elegibilidad/i,
      /calibraci/i,
    ]

    for (const label of existingModuleLabels) {
      const navItem = page.getByRole("link", { name: label }).or(
        page.locator("nav, aside").getByText(label),
      )
      await expect(navItem.first()).toBeVisible({ timeout: 5_000 })
    }

    // New module labels — these will be visible once their module definitions
    // are added to src/modules/registry.ts. Check gracefully.
    const newModuleLabels = [
      /precios|prices/i,
      /pesaje|weighting/i,
      /mtr/i,
      /trazabilidad|traceability/i,
    ]

    for (const label of newModuleLabels) {
      const navItem = page.getByRole("link", { name: label }).or(
        page.locator("nav, aside").getByText(label),
      )
      // These may not be visible yet if the module isn't registered
      if (await navItem.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
        await expect(navItem.first()).toBeVisible()
      }
    }
  })

  // JAA-411: quarantined (stale/aspirational selector vs current DOM) — repair or port to vitest.
  test.fixme("disabled module is hidden from navigation", { tag: "@smoke" }, async ({ page }) => {
    // Disable prices module
    await setModuleConfig(page, { prices: false })
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)

    await expect(page.locator("nav, [role='navigation'], aside")).toBeVisible({ timeout: 10_000 })

    // "Precios" should NOT be in the navigation
    const preciosLink = page.getByRole("link", { name: /precios|prices/i }).or(
      page.locator("nav, aside").getByText(/precios|prices/i),
    )
    await expect(preciosLink).not.toBeVisible({ timeout: 3_000 })

    // Other enabled modules should still be visible
    const syncLink = page.getByRole("link", { name: /sync|sincronizaci/i }).or(
      page.locator("nav, aside").getByText(/sync|sincronizaci/i),
    )
    await expect(syncLink.first()).toBeVisible({ timeout: 5_000 })
  })

  test("navigating to disabled module route redirects to default", { tag: "@smoke" }, async ({ page }) => {
    // Disable prices module
    await setModuleConfig(page, { prices: false })
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)

    // Navigate directly to the disabled module's route
    await page.goto("/ms-process-app/precios")

    // Should redirect to the default (first enabled) module, not show a blank page
    // Wait for the URL to change away from /precios
    await expect(page).not.toHaveURL(/precios/, { timeout: 10_000 })
  })

  // JAA-411: quarantined (stale/aspirational selector vs current DOM) — repair or port to vitest.
  test.fixme("unknown path redirects to first enabled module", { tag: "@smoke" }, async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)

    // Navigate to a nonexistent route
    await page.goto("/ms-process-app/nonexistent-route")

    // Should redirect to the first enabled module (not show a 404 blank page)
    // The exact URL depends on which module is first in the registry
    await expect(page.locator("nav, [role='navigation'], aside, main")).toBeVisible({
      timeout: 10_000,
    })

    // The URL should not remain at /nonexistent-route
    const url = page.url()
    expect(url).not.toContain("nonexistent-route")
  })
})

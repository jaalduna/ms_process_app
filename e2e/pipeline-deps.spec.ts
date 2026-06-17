import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * Pipeline dependency indicators E2E. After the rebrand the DependencyIndicator
 * renders only on Eligibility cards (calibración dropped it — "sync is skipped,
 * data already in Databricks"). Eligibility depends on Precios
 * (STAGE_DEPENDENCIES.elegibilidad = ["prices"]), so each card surfaces a
 * "Precios" dependency pill (role=status) reflecting upstream completion.
 *
 * The dependency *logic* (completed / not_run / unknown, allMet) is unit-tested
 * in src/__tests__/usePipelineDeps.test.tsx and DependencyIndicator.test.tsx;
 * this only confirms the indicator is wired into the live card.
 */
test.describe("Pipeline Dependency Indicators E2E", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
  })

  test("eligibility cards show their upstream Precios dependency", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Elegibilidad", /elegibilidad/)

    const mexico = page.locator('[data-slot="card"]').filter({ hasText: "Mexico" })
    await expect(mexico).toBeVisible({ timeout: 10_000 })

    // The Precios dependency pill is a role=status element whose accessible name
    // states the upstream stage + its status ("Precios: completed …" / "not yet run").
    const depPill = mexico.getByRole("status").filter({ hasText: "Precios" })
    await expect(depPill).toBeVisible({ timeout: 10_000 })
    await expect(depPill).toHaveAttribute("aria-label", /Precios:/)

    // Every country card carries the indicator (9 countries).
    const allPills = page.getByRole("status").filter({ hasText: "Precios" })
    expect(await allPills.count()).toBe(9)
  })
})

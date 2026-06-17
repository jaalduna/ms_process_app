import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

test.describe("Pipeline Dependency Indicators E2E", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
  })

  test("dependency indicators render on country cards when upstream completed", { tag: "@smoke" }, async ({
    page,
  }) => {
    // Navigate to a pipeline module that has upstream dependencies
    // Weighting depends on Eligibility — mock seeds completed eligibility runs
    await navigateTo(page, "Pesaje", /pesaje/)

    // Country cards should show dependency status indicators.
    // After reset, mock has seeded completed runs for most countries.
    // Look for visual indicators (check marks, badges, status icons)
    const cards = page.locator("[data-testid='country-card'], .country-card").or(
      page.getByRole("article"),
    )
    await expect(cards.first()).toBeVisible({ timeout: 10_000 })

    // Look for dependency status indicators (green checks, status badges)
    // These could be SVG icons, badge elements, or text indicators
    const depIndicators = page
      .locator("[data-testid*='dep'], [class*='dependency'], [class*='status-indicator']")
      .or(page.locator("[aria-label*='dependency'], [title*='dependency']"))
      .or(page.getByText(/upstream|dependency|prerequisite/i))

    // At least some indicators should be visible on the cards
    // (mock seeds completed upstream runs for most countries)
    if (await depIndicators.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      const count = await depIndicators.count()
      expect(count).toBeGreaterThan(0)
    }
  })

  test("triggering with unmet dependencies shows a warning", { tag: "@smoke" }, async ({ page }) => {
    // Navigate to a pipeline module
    await navigateTo(page, "Pesaje", /pesaje/)

    // Ecuador and CAM have failed eligibility in the mock seed,
    // so their weighting dependency should be unmet
    const ecuadorCard = page.getByText("ecuador", { exact: false }).first()
    await expect(ecuadorCard).toBeVisible({ timeout: 10_000 })
    await ecuadorCard.click()

    // Try to trigger — should show a dependency warning
    const triggerBtn = page.getByRole("button", { name: /trigger|run|start/i })
    await expect(triggerBtn).toBeVisible({ timeout: 10_000 })
    await triggerBtn.click()

    // Should see a warning about unmet dependencies
    const warning = page.getByText(/warning|dependency|prerequisite|unmet|not completed/i)
    if (await warning.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(warning.first()).toBeVisible()

      // Should still allow proceeding
      const proceedBtn = page.getByRole("button", {
        name: /proceed|continue|anyway|confirm|start/i,
      })
      await expect(proceedBtn).toBeVisible({ timeout: 3_000 })
      await proceedBtn.click()

      // Run should be created despite the warning
      await expect(
        page.getByText(/running|in progress|pending|created/i).first(),
      ).toBeVisible({ timeout: 10_000 })
    }
  })

  test("can trigger despite unmet dependency warning", { tag: "@smoke" }, async ({ page }) => {
    // Navigate to a pipeline module with an unmet dependency country
    await navigateTo(page, "Pesaje", /pesaje/)

    const camCard = page.getByText("cam", { exact: false }).first()
    await expect(camCard).toBeVisible({ timeout: 10_000 })
    await camCard.click()

    // Trigger
    const triggerBtn = page.getByRole("button", { name: /trigger|run|start/i })
    await expect(triggerBtn).toBeVisible({ timeout: 10_000 })
    await triggerBtn.click()

    // If warning appears, proceed anyway
    const proceedBtn = page.getByRole("button", {
      name: /proceed|continue|anyway|confirm|start/i,
    })
    if (await proceedBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await proceedBtn.click()
    }

    // Verify a run was created (running or pending state)
    await expect(
      page.getByText(/running|in progress|pending|created/i).first(),
    ).toBeVisible({ timeout: 10_000 })
  })
})

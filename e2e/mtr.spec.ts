import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

test.describe("MTR Module E2E", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
  })

  test("page loads with 9 country cards", async ({ page }) => {
    await navigateTo(page, "MTR", /mtr/)

    const cards = page.locator("[data-testid='country-card'], .country-card").or(
      page.getByRole("article"),
    )
    await expect(cards.first()).toBeVisible({ timeout: 10_000 })
    const count = await cards.count()
    expect(count).toBe(9)
  })

  test("trigger creates run and shows step-based progress", async ({ page }) => {
    await navigateTo(page, "MTR", /mtr/)

    // Click a country card
    const card = page.getByText("chile", { exact: false }).first()
    await expect(card).toBeVisible()
    await card.click()

    // Trigger a run
    const triggerBtn = page.getByRole("button", { name: /trigger|run|start/i })
    await expect(triggerBtn).toBeVisible({ timeout: 10_000 })
    await triggerBtn.click()

    // Should see running state with step indicators
    await expect(
      page.getByText(/running|in progress|step/i).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test("completed run shows imputation results summary", async ({ page }) => {
    await navigateTo(page, "MTR", /mtr/)

    // Click a country card
    const card = page.getByText("chile", { exact: false }).first()
    await expect(card).toBeVisible()
    await card.click()

    // Trigger and wait for completion
    const triggerBtn = page.getByRole("button", { name: /trigger|run|start/i })
    await expect(triggerBtn).toBeVisible({ timeout: 10_000 })
    await triggerBtn.click()

    // Wait for completion — mock generates results_summary with
    // total_targets, targets_achieved, total_imputations, quality_score
    await expect(
      page.getByText(/completed|target|imputation|quality/i).first(),
    ).toBeVisible({ timeout: 30_000 })
  })

  test("failed run shows error details and retry action", async ({ page }) => {
    await navigateTo(page, "MTR", /mtr/)

    // Click a country card
    const card = page.getByText("chile", { exact: false }).first()
    await expect(card).toBeVisible()
    await card.click()

    // Create a run via API and force it to fail
    const createRes = await page.request.post(`${MOCK_API_BASE}/mtr/runs`, {
      data: { country: "chile", period: 202602 },
    })
    const run = await createRes.json()

    await page.request.post(`${MOCK_API_BASE}/test/fail-run/${run.run_id}`, {
      data: { step: "compute_imputations" },
    })

    await page.request.post(`${MOCK_API_BASE}/mtr/runs/${run.run_id}/execute`)

    // Reload to pick up the failed state
    await page.reload()

    // Verify error state
    await expect(
      page.getByText(/failed|error/i).first(),
    ).toBeVisible({ timeout: 15_000 })

    // Verify retry action
    await expect(
      page.getByRole("button", { name: /retry|re-run|try again/i }),
    ).toBeVisible({ timeout: 5_000 })
  })
})

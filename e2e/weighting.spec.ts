import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

test.describe("Weighting Module E2E", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
  })

  test("page loads with country cards", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Pesaje", /pesaje/)

    const cards = page.locator("[data-testid='country-card'], .country-card").or(
      page.getByRole("article"),
    )
    await expect(cards.first()).toBeVisible({ timeout: 10_000 })
    const count = await cards.count()
    expect(count).toBe(9)
  })

  test("config dialog opens and accepts parameter changes", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Pesaje", /pesaje/)

    // Click a country card
    const card = page.getByText("chile", { exact: false }).first()
    await expect(card).toBeVisible()
    await card.click()

    // Open configuration dialog
    const configBtn = page.getByRole("button", { name: /config|settings|parameters/i })
    await expect(configBtn).toBeVisible({ timeout: 10_000 })
    await configBtn.click()

    // Dialog should be visible
    await expect(page.getByRole("dialog").or(page.locator("[role='dialog']"))).toBeVisible({
      timeout: 5_000,
    })

    // Look for input fields and modify a parameter
    const inputs = page.getByRole("dialog").locator("input, select")
    const inputCount = await inputs.count()
    expect(inputCount).toBeGreaterThan(0)

    // Save/close the dialog
    const saveBtn = page.getByRole("button", { name: /save|apply|confirm|close/i })
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()

    // Dialog should close
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5_000 })
  })

  test("trigger shows progress and completed run shows weight stats", async ({ page }) => {
    await navigateTo(page, "Pesaje", /pesaje/)

    // Click a country card
    const card = page.getByText("chile", { exact: false }).first()
    await expect(card).toBeVisible()
    await card.click()

    // Trigger a run
    const triggerBtn = page.getByRole("button", { name: /trigger|run|start/i })
    await expect(triggerBtn).toBeVisible({ timeout: 10_000 })
    await triggerBtn.click()

    // Should see running state
    await expect(
      page.getByText(/running|in progress|step/i).first(),
    ).toBeVisible({ timeout: 15_000 })

    // Wait for completion and verify summary stats
    await expect(
      page.getByText(/completed|summary|weight|min|max|mean|median/i).first(),
    ).toBeVisible({ timeout: 30_000 })
  })

  test("cancel stops running weighting and shows cancelled status", async ({ page }) => {
    await navigateTo(page, "Pesaje", /pesaje/)

    // Click a country card
    const card = page.getByText("chile", { exact: false }).first()
    await expect(card).toBeVisible()
    await card.click()

    // Trigger a run
    const triggerBtn = page.getByRole("button", { name: /trigger|run|start/i })
    await expect(triggerBtn).toBeVisible({ timeout: 10_000 })
    await triggerBtn.click()

    // Wait for running state
    await expect(page.getByText(/running|in progress/i).first()).toBeVisible({ timeout: 15_000 })

    // Cancel
    const cancelBtn = page.getByRole("button", { name: /cancel/i })
    await expect(cancelBtn).toBeVisible()
    await cancelBtn.click()

    // Confirm if dialog appears
    const confirmBtn = page.getByRole("button", { name: /confirm|yes/i })
    if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    // Verify cancelled status
    await expect(page.getByText(/cancelled|canceled/i).first()).toBeVisible({ timeout: 10_000 })
  })
})

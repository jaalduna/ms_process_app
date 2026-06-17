import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

test.describe("Prices Module E2E", () => {
  test.beforeEach(async ({ page }) => {
    // Enable all modules and reset mock server state (deterministic mode)
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
  })

  test("page loads with 9 country cards", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Precios", /precios/)

    // Each country card should be visible — 9 countries total
    const cards = page.locator("[data-testid='country-card'], .country-card").or(
      page.getByRole("article"),
    )
    await expect(cards.first()).toBeVisible({ timeout: 10_000 })
    const count = await cards.count()
    expect(count).toBe(9)
  })

  test("trigger validation shows progress indicators", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Precios", /precios/)

    // Click a country card (e.g., Chile)
    const chileCard = page.getByText("chile", { exact: false }).first()
    await expect(chileCard).toBeVisible()
    await chileCard.click()

    // Look for a trigger/run button
    const triggerBtn = page.getByRole("button", { name: /trigger|run|validate|start/i })
    await expect(triggerBtn).toBeVisible({ timeout: 10_000 })
    await triggerBtn.click()

    // Should see running status or step progress
    await expect(
      page.getByText(/running|in progress|step/i).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test("completed run shows outlier results table", async ({ page }) => {
    await navigateTo(page, "Precios", /precios/)

    // Click a country card
    const card = page.getByText("chile", { exact: false }).first()
    await expect(card).toBeVisible()
    await card.click()

    // Trigger a run
    const triggerBtn = page.getByRole("button", { name: /trigger|run|validate|start/i })
    await expect(triggerBtn).toBeVisible({ timeout: 10_000 })
    await triggerBtn.click()

    // Wait for completion — mock server in deterministic mode completes reliably
    await expect(
      page.getByText(/results|outlier|completed|approved/i).first(),
    ).toBeVisible({ timeout: 30_000 })

    // Verify the results table has expected column headers
    await expect(page.getByText(/product/i).first()).toBeVisible()
  })

  test("approval action updates status to approved", async ({ page }) => {
    await navigateTo(page, "Precios", /precios/)

    // Click a country card
    const card = page.getByText("chile", { exact: false }).first()
    await expect(card).toBeVisible()
    await card.click()

    // Trigger and wait for results_ready
    const triggerBtn = page.getByRole("button", { name: /trigger|run|validate|start/i })
    await expect(triggerBtn).toBeVisible({ timeout: 10_000 })
    await triggerBtn.click()

    // Wait for results to be ready
    const approveBtn = page.getByRole("button", { name: /approve/i })
    await expect(approveBtn).toBeVisible({ timeout: 30_000 })
    await approveBtn.click()

    // Verify approved status
    await expect(page.getByText(/approved/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test("cancel stops running validation and shows cancelled status", async ({ page }) => {
    await navigateTo(page, "Precios", /precios/)

    // Click a country card
    const card = page.getByText("chile", { exact: false }).first()
    await expect(card).toBeVisible()
    await card.click()

    // Trigger a run
    const triggerBtn = page.getByRole("button", { name: /trigger|run|validate|start/i })
    await expect(triggerBtn).toBeVisible({ timeout: 10_000 })
    await triggerBtn.click()

    // Wait for running state
    await expect(page.getByText(/running|in progress/i).first()).toBeVisible({ timeout: 15_000 })

    // Click cancel
    const cancelBtn = page.getByRole("button", { name: /cancel/i })
    await expect(cancelBtn).toBeVisible()
    await cancelBtn.click()

    // Confirm cancellation if a dialog appears
    const confirmBtn = page.getByRole("button", { name: /confirm|yes/i })
    if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    // Verify cancelled status
    await expect(page.getByText(/cancelled|canceled/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test("failed run shows error message and retry action", async ({ page }) => {
    await navigateTo(page, "Precios", /precios/)

    // Click a country card
    const card = page.getByText("chile", { exact: false }).first()
    await expect(card).toBeVisible()
    await card.click()

    // Create a run via API, then force it to fail
    const createRes = await page.request.post(`${MOCK_API_BASE}/prices/runs`, {
      data: { country: "chile", period: 202602 },
    })
    const run = await createRes.json()

    // Force failure at the second step
    await page.request.post(`${MOCK_API_BASE}/test/fail-run/${run.run_id}`, {
      data: { step: "detect_outliers" },
    })

    // Execute the run
    await page.request.post(`${MOCK_API_BASE}/prices/runs/${run.run_id}/execute`)

    // Reload the page to pick up the run status
    await page.reload()

    // Wait for the failed state to appear
    await expect(
      page.getByText(/failed|error/i).first(),
    ).toBeVisible({ timeout: 15_000 })

    // Verify retry action is available
    await expect(
      page.getByRole("button", { name: /retry|re-run|try again/i }),
    ).toBeVisible({ timeout: 5_000 })
  })

  test("history shows past runs for a country", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Precios", /precios/)

    // The mock server seeds one completed/approved run per country.
    // Click on a country card to see its details
    const card = page.getByText("chile", { exact: false }).first()
    await expect(card).toBeVisible()
    await card.click()

    // Look for history or past runs indicator
    const historyBtn = page.getByRole("button", { name: /history|past runs|previous/i })
    if (await historyBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await historyBtn.click()
      // Should see at least one past run row
      await expect(page.getByText(/approved|completed/i).first()).toBeVisible({ timeout: 5_000 })
    } else {
      // History may be shown inline — verify there's at least one past run visible
      await expect(page.getByText(/approved|completed/i).first()).toBeVisible({ timeout: 10_000 })
    }
  })
})

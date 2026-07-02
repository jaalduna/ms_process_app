import { test, expect } from "@playwright/test"
import type { Page } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * JAA-775 — duration counters for in-progress runs must tick live (~1s),
 * not freeze until an unrelated re-render. Seeds a frozen "running"
 * calibration job (server never advances it — see mock-server's
 * seedRunningJob) so the only thing that can move the rendered duration
 * text is the shared LiveDuration component's own timer, not mock-server
 * step progression.
 */

async function seedRunning(page: Page, country: string, period: string) {
  const res = await page.request.post(`${MOCK_API_BASE}/test/seed-calibration-run`, {
    data: { country, period },
  })
  expect(res.ok()).toBeTruthy()
}

/** Mirror CalibrationPage.currentPeriod(): the previous calendar month, YYYYMM. */
function currentPeriod(): string {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${prev.getFullYear()}${String(prev.getMonth() + 1).padStart(2, "0")}`
}

test("ac4: an in-progress run's duration text changes within 2s with zero user interaction", async ({ page }) => {
  const period = currentPeriod()
  await setModuleConfig(page, {})
  await page.request.post(`${MOCK_API_BASE}/test/reset`)
  await seedRunning(page, "mexico", period)

  await login(page)
  await navigateTo(page, "Calibración", /calibration/)

  const card = page.locator('[data-slot="card"]').filter({ hasText: "Mexico" }).first()
  const eye = card.getByRole("button", { name: /view calibration details/i })
  await expect(eye).toBeVisible({ timeout: 15_000 })
  await eye.click()

  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()

  const durationValue = dialog.getByText("Duration", { exact: true }).locator("xpath=following-sibling::p")
  await expect(durationValue).toBeVisible()

  const before = await durationValue.textContent()

  // Real wall-clock wait — no user interaction, no reload, nothing else
  // touches this modal. If the text is still `before` after waiting past
  // LiveDuration's 1s tick, it froze.
  await expect
    .poll(async () => durationValue.textContent(), { timeout: 2_000, intervals: [250] })
    .not.toBe(before)
})

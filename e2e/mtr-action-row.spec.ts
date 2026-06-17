import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * MTR country-card action row must wrap (flex-wrap) so the Running / Stop / eye
 * buttons are never clipped in a narrow card (regression family: JAA-360,
 * pesaje, precios, calibracion).
 */
test("MTR running-state action row wraps and never clips its buttons", { tag: "@smoke" }, async ({ page }) => {
  await setModuleConfig(page, {})
  await page.request.post(`${MOCK_API_BASE}/test/reset`)
  await login(page)
  // Narrow viewport → narrow cards, the width where an unwrapped row overflows.
  await page.setViewportSize({ width: 880, height: 900 })
  await navigateTo(page, "MTR", /mtr/)

  const argCard = page.getByRole("button", { name: /View MTR history for Argentina/i })
  await expect(argCard).toBeVisible({ timeout: 10_000 })

  // Trigger a run → running state (Running + Stop + eye).
  await argCard.getByRole("button", { name: /Ejecutar/i }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: /^Confirm$/i }).click()

  const runningBtn = argCard.getByRole("button", { name: /Running\.\.\.|Starting\.\.\./i })
  await expect(runningBtn).toBeVisible({ timeout: 15_000 })
  await expect(argCard.getByRole("button", { name: /^Stop$/i })).toBeVisible()

  // Wait for the run to leave "pending" so the eye (view-detail) button renders
  // → all three buttons present, the clip scenario.
  const actionRow = argCard.locator("div.flex.flex-wrap.gap-2")
  await expect(actionRow).toBeVisible()
  await expect.poll(async () => actionRow.getByRole("button").count(), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(3)

  // The fix: the row wraps. Verify computed style + no horizontal overflow.
  const wrap = await actionRow.evaluate((el) => getComputedStyle(el).flexWrap)
  expect(wrap).toBe("wrap")
  const overflow = await actionRow.evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)

  // Every button is fully inside the action row's box (not clipped).
  const rowBox = await actionRow.boundingBox()
  const btns = await actionRow.getByRole("button").all()
  for (const b of btns) {
    const bb = await b.boundingBox()
    expect(bb!.x + bb!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width + 1)
  }

  await page.screenshot({ path: ".playwright-mcp/mtr-action-row-running.png" })
})

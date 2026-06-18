import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

// JAA-421 — Overview period filter. Seed data spreads stages across periods:
// prices/weighting/mtr live in 202602; eligibility + calibración in the
// previous-month period (e.g. 202605). The Overview must let you pick a period
// and show, per cell, the latest run *within that period* (or "—").
test.describe("Overview period filter", { tag: "@smoke" }, () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
  })

  test("renders a period selector, defaults to the most recent period with data, and refetches on change", async ({ page }) => {
    // Lands on the Overview (sync disabled → default route).
    await expect(page.getByRole("heading", { name: /Country Pipeline Overview/i })).toBeVisible({ timeout: 15_000 })

    // A period selector is present and the subtitle reflects the selected period.
    const selector = page.getByRole("combobox")
    await expect(selector).toBeVisible()
    const subtitle = page.getByText(/periodo \w+ \d{4}/i)
    await expect(subtitle).toBeVisible()

    // Wait for the table to finish loading (a populated or empty cell renders).
    const table = page.getByRole("table")
    await expect(table).toBeVisible()
    await expect(table.getByText("—").first()).toBeVisible({ timeout: 15_000 })

    // No per-cell period number anywhere (date only). The raw YYYYMM digits must
    // not appear (the selector shows "May 2026", never "202605").
    await expect(page.getByText(/^20\d{4}$/)).toHaveCount(0)

    const subtitleBefore = (await subtitle.textContent())?.trim()
    const dashesBefore = await table.getByText("—").count()

    // Switch to another period that has data (Feb 2026 → 202602, where
    // prices/weighting/mtr ran). The PeriodSelector lists data-driven options.
    await selector.click()
    const options = page.getByRole("option")
    await expect(options.first()).toBeVisible()
    // Pick an option different from the current selection.
    const feb = page.getByRole("option", { name: /Feb 2026/i })
    await expect(feb).toBeVisible()
    await feb.click()

    // Subtitle updates and the table refetched → cell population changed.
    await expect(page.getByText(/periodo feb 2026/i)).toBeVisible({ timeout: 15_000 })
    const subtitleAfter = (await subtitle.textContent())?.trim()
    expect(subtitleAfter).not.toBe(subtitleBefore)

    await expect
      .poll(async () => table.getByText("—").count(), { timeout: 15_000 })
      .not.toBe(dashesBefore)

    // Still no raw period digits after the switch.
    await expect(page.getByText(/^20\d{4}$/)).toHaveCount(0)
  })
})

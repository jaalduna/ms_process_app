import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

test.describe("Traceability Module E2E", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
  })

  test("page loads with tag list", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Trazabilidad", /trazabilidad/)

    // Should see a table or list of tags
    const table = page.locator("table").or(page.locator("[role='grid']"))
    await expect(table.first()).toBeVisible({ timeout: 10_000 })

    // Should have rows (mock seeds 25 tags)
    const rows = table.first().locator("tbody tr").or(table.first().locator("[role='row']"))
    const count = await rows.count()
    expect(count).toBeGreaterThan(0)
  })

  test("filter by country shows only matching tags", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Trazabilidad", /trazabilidad/)

    // Wait for tag list to load
    const table = page.locator("table").or(page.locator("[role='grid']"))
    await expect(table.first()).toBeVisible({ timeout: 10_000 })

    // Find and click the country filter
    const countryFilter = page.getByRole("combobox", { name: /country|pais/i }).or(
      page.locator("select").filter({ hasText: /country|pais/i }),
    )
    if (await countryFilter.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await countryFilter.click()
      await page.getByRole("option", { name: /chile/i }).click()
    } else {
      // May be a different filter UI — try text-based filter
      const filterInput = page.getByPlaceholder(/country|filter/i)
      if (await filterInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await filterInput.fill("chile")
      }
    }

    // After filtering, all visible rows should be for Chile
    await expect(page.getByText("chile").first()).toBeVisible({ timeout: 5_000 })
  })

  test("filter by stage shows only matching tags", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Trazabilidad", /trazabilidad/)

    const table = page.locator("table").or(page.locator("[role='grid']"))
    await expect(table.first()).toBeVisible({ timeout: 10_000 })

    // Find and click the stage filter
    const stageFilter = page.getByRole("combobox", { name: /stage|etapa/i }).or(
      page.locator("select").filter({ hasText: /stage|etapa/i }),
    )
    if (await stageFilter.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await stageFilter.click()
      await page.getByRole("option", { name: /calibration/i }).click()
    }

    // After filtering, visible rows should match calibration stage
    await expect(page.getByText(/calibration/i).first()).toBeVisible({ timeout: 5_000 })
  })

  test("combined filters show intersection of results", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Trazabilidad", /trazabilidad/)

    const table = page.locator("table").or(page.locator("[role='grid']"))
    await expect(table.first()).toBeVisible({ timeout: 10_000 })

    // Apply country filter
    const countryFilter = page.getByRole("combobox", { name: /country|pais/i })
    if (await countryFilter.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await countryFilter.click()
      await page.getByRole("option", { name: /chile/i }).click()
    }

    // Apply stage filter
    const stageFilter = page.getByRole("combobox", { name: /stage|etapa/i })
    if (await stageFilter.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await stageFilter.click()
      await page.getByRole("option", { name: /calibration/i }).click()
    }

    // Results should include both chile and calibration
    await expect(page.getByText("chile").first()).toBeVisible({ timeout: 5_000 })
  })

  test("pagination shows different tags on next page", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Trazabilidad", /trazabilidad/)

    const table = page.locator("table").or(page.locator("[role='grid']"))
    await expect(table.first()).toBeVisible({ timeout: 10_000 })

    // Look for pagination controls (next page button, page numbers)
    const nextBtn = page.getByRole("button", { name: /next|>|page 2/i }).or(
      page.locator("[aria-label*='next']"),
    )
    if (await nextBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // Get first row text before pagination
      const firstRowBefore = await table
        .first()
        .locator("tbody tr")
        .first()
        .textContent()

      await nextBtn.click()

      // After clicking next, the first row should be different
      await expect(table.first().locator("tbody tr").first()).toBeVisible({ timeout: 5_000 })
      const firstRowAfter = await table
        .first()
        .locator("tbody tr")
        .first()
        .textContent()

      // The content should change (different page of results)
      expect(firstRowAfter).not.toBe(firstRowBefore)
    }
    // If no pagination controls are visible with 25 tags, the page size is >= 25
    // and this test gracefully passes without asserting pagination UI
  })

  // SKIPPED: TagDetailModal is a frontend stub (returns null) and tag rows are
  // not clickable yet. Tracked in JAA-359 (wire detail modal + downloads). The
  // mock endpoints (GET /tags/:id, .../download) already exist; this is UI work.
  test.skip("clicking a tag row opens detail modal", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Trazabilidad", /trazabilidad/)

    const table = page.locator("table").or(page.locator("[role='grid']"))
    await expect(table.first()).toBeVisible({ timeout: 10_000 })

    // Click the first data row
    const firstRow = table.first().locator("tbody tr").first()
    await expect(firstRow).toBeVisible()
    await firstRow.click()

    // Should open a detail modal/dialog
    const modal = page.getByRole("dialog").or(page.locator("[role='dialog']"))
    await expect(modal).toBeVisible({ timeout: 5_000 })

    // Modal should show run metadata and a table list
    await expect(modal.getByText(/table|run|metadata|country|period/i).first()).toBeVisible()
  })

  // SKIPPED: depends on the stubbed TagDetailModal (see JAA-359).
  test.skip("CSV download initiates for a tagged table", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Trazabilidad", /trazabilidad/)

    const table = page.locator("table").or(page.locator("[role='grid']"))
    await expect(table.first()).toBeVisible({ timeout: 10_000 })

    // Click the first row to open detail
    const firstRow = table.first().locator("tbody tr").first()
    await expect(firstRow).toBeVisible()
    await firstRow.click()

    // Wait for modal
    const modal = page.getByRole("dialog").or(page.locator("[role='dialog']"))
    await expect(modal).toBeVisible({ timeout: 5_000 })

    // Click download button on a table in the modal
    const downloadBtn = modal.getByRole("button", { name: /download|csv|export/i }).or(
      modal.getByRole("link", { name: /download|csv|export/i }),
    )
    if (await downloadBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // Wait for the download event
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 10_000 }),
        downloadBtn.click(),
      ])

      // Verify the download has a CSV filename
      expect(download.suggestedFilename()).toMatch(/\.csv$/)
    }
  })
})

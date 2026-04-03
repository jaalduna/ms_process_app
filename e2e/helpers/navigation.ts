import { Page, expect } from "@playwright/test"

/**
 * Navigate to a module by clicking its link in the sidebar/nav.
 * @param page - Playwright page
 * @param moduleName - display name to match (case-insensitive)
 * @param expectedUrl - regex to verify the URL changed
 */
export async function navigateTo(page: Page, moduleName: string, expectedUrl: RegExp) {
  const link = page.getByRole("link", { name: new RegExp(moduleName, "i") })
  await expect(link).toBeVisible()
  await link.click()
  await expect(page).toHaveURL(expectedUrl, { timeout: 10_000 })
}

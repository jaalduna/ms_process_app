import { Page, expect } from "@playwright/test"

/**
 * Log in via the DevAuthProvider (VITE_AUTH_BYPASS=true).
 * Navigates to the app root, waits for the login page, and clicks Sign In.
 */
export async function login(page: Page) {
  await page.goto("/")
  await expect(page.getByText("SQL-Databricks Bridge")).toBeVisible({ timeout: 10_000 })
  await page.getByRole("button", { name: /sign in/i }).click()
}

import { Page, expect } from "@playwright/test"

/**
 * Log in via the DevAuthProvider (VITE_AUTH_BYPASS=true).
 * Navigates to the app root, waits for the login page, and clicks the sign-in
 * button. The label depends on the active auth provider:
 *   - dev bypass → "Continue (dev)"
 *   - msal       → "Sign in with Microsoft"
 *   - github     → "Sign in with GitHub"
 */
export async function login(page: Page) {
  await page.goto("/ms-process-app/")
  const signIn = page.getByRole("button", { name: /continue \(dev\)|sign in with/i })
  await expect(signIn).toBeVisible({ timeout: 15_000 })
  await signIn.click()
}

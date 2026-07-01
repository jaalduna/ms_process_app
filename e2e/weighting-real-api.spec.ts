import { test, expect } from "@playwright/test"
import type { Page } from "@playwright/test"
import { navigateTo } from "./helpers/navigation"
import { card, openCardModal, confirmRun } from "./helpers/weighting"

/**
 * Weighting E2E against the REAL App Service dev (no mock server).
 *
 * Runbook:
 *   REMOTE_DEV_URL=https://app-cl-prd-nmr-wp-msproc-dev.azurewebsites.net \
 *   npx playwright test e2e/weighting-real-api.spec.ts --project smoke
 *
 * Requirements:
 *   - VPN / IP allow-list for the App Service dev.
 *   - Weighting job IDs registered via PUT /api/v1/admin/jobs/pesaje/<country>
 *     (run scripts/register_weighting_jobs.sh if needed — see JAA-568).
 *   - The App Service runs the dev-noauth build (VITE_AUTH_BYPASS=true).
 *
 * This spec does NOT call POST /test/reset (the real backend has no such
 * endpoint). Each test creates its own run and cancels it on teardown to avoid
 * orphaned Databricks jobs.
 *
 * Completion polling is intentionally excluded: real pesaje jobs take 30+ min
 * and exceed the 5-min Playwright timeout. The smoke gate verifies
 * create → execute → running (steps start advancing), which is sufficient to
 * confirm the plumbing works end-to-end.
 */

const REMOTE_DEV_URL = process.env.REMOTE_DEV_URL
const API_BASE = `${REMOTE_DEV_URL ?? "https://app-cl-prd-nmr-wp-msproc-dev.azurewebsites.net"}/api/v1`

/**
 * Log in on the remote dev App Service.
 * The dev-noauth build has VITE_AUTH_BYPASS=true, so the login page exposes
 * a "Continue (dev)" button — same path as local dev:e2e.
 * The base path is "/" on the App Service (VITE_BASE_PATH=/), so we go to "/"
 * directly instead of "/ms-process-app/".
 */
async function loginRemote(page: Page) {
  await page.goto("/")
  const signIn = page.getByRole("button", { name: /continue \(dev\)/i })
  await expect(signIn).toBeVisible({ timeout: 10_000 })
  await signIn.click()
  // Wait until we're past the login page — the module links appear in the footer
  // of the login screen AND in the sidebar; use the sidebar link (only rendered
  // post-login) to confirm authentication completed.
  await expect(page.getByRole("link", { name: /pesaje/i })).toBeVisible({ timeout: 20_000 })
}

/** Cancel a run by ID via the API — cleanup utility used in afterEach. */
async function cancelRun(page: Page, runId: string) {
  await page.request
    .post(`${API_BASE}/weighting/runs/${runId}/cancel`, {
      headers: { "Content-Type": "application/json" },
      data: {},
    })
    .catch(() => undefined) // best-effort — don't fail the test on cancel error
}

test.describe("Weighting against real App Service dev", () => {
  test.skip(!REMOTE_DEV_URL, "Set REMOTE_DEV_URL to the App Service dev URL to run this spec.")

  test.use({ baseURL: REMOTE_DEV_URL })

  test.beforeEach(async ({ page }) => {
    await loginRemote(page)
  })

  test(
    "page loads with 9 country cards",
    { tag: "@smoke" },
    async ({ page }) => {
      await navigateTo(page, "Pesaje", /pesaje/)
      const cards = page.locator('[data-slot="card"]')
      await expect(cards.first()).toBeVisible({ timeout: 15_000 })
      expect(await cards.count()).toBeGreaterThanOrEqual(9)
    },
  )

  test(
    "card opens modal with editable params",
    { tag: "@smoke" },
    async ({ page }) => {
      await navigateTo(page, "Pesaje", /pesaje/)
      const modal = await openCardModal(page, "Chile")
      await expect(modal.getByLabel("MAX_ROUNDS_COLAPSO")).toBeVisible()
      await page.keyboard.press("Escape")
      await expect(modal).not.toBeVisible({ timeout: 5_000 })
    },
  )

  test(
    "execute triggers a real Databricks run (create → running)",
    { tag: "@smoke" },
    async ({ page }) => {
      await navigateTo(page, "Pesaje", /pesaje/)

      // Intercept the POST /weighting/runs to capture the run_id for cleanup.
      let runId: string | undefined
      page.on("response", async (resp) => {
        if (resp.url().includes("/weighting/runs") && resp.request().method() === "POST") {
          const body = await resp.json().catch(() => ({}))
          if (body.run_id) runId = body.run_id
        }
      })

      const modal = await openCardModal(page, "Chile")
      await confirmRun(page, modal)

      // The card status should transition from "Pendiente" / initial → "En Progreso"
      // within a few seconds as Databricks accepts the job.
      const chileCard = card(page, "Chile")
      await expect(
        chileCard.getByText(/En Progreso|Ejecutando|running/i).first(),
      ).toBeVisible({ timeout: 30_000 })

      // Cleanup: cancel the Databricks run we just launched.
      if (runId) await cancelRun(page, runId)
    },
  )
})

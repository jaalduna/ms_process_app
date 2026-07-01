import { test, expect } from "@playwright/test"
import type { Page, Browser, Locator } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * JAA-648 — calibration in-flight state is server-authoritative (derived from
 * GET /calibration/runs), NOT per-browser localStorage. These specs prove:
 *   ac3: a running calibration is recovered after a full reload AND is visible in
 *        a second, independent browser context (shared/server-side).
 *   ac4: a stale legacy localStorage key ("bridge:calibration-job-ids") is
 *        ignored (the app derives state from the backend) and cleared on load.
 *
 * A frozen "running" run is seeded via POST /test/seed-calibration-run so the
 * assertions don't race the fast (150ms) mock step interval.
 */

const LEGACY_KEY = "bridge:calibration-job-ids"

/** Mirror CalibrationPage.currentPeriod(): the previous calendar month, YYYYMM. */
function currentPeriod(): string {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${prev.getFullYear()}${String(prev.getMonth() + 1).padStart(2, "0")}`
}

function mexicoCard(page: Page): Locator {
  return page.locator('[data-slot="card"]').filter({ hasText: "Mexico" }).first()
}

async function seedRunning(page: Page, country: string, period: string) {
  const res = await page.request.post(`${MOCK_API_BASE}/test/seed-calibration-run`, {
    data: { country, period },
  })
  expect(res.ok()).toBeTruthy()
}

/** A running Mexico run shows the Stop control + the "Ver detalle" eye button. */
async function expectMexicoRunning(page: Page) {
  const card = mexicoCard(page)
  await expect(card.getByRole("button", { name: /stop calibration/i })).toBeVisible({ timeout: 15_000 })
  await expect(card.getByRole("button", { name: /view calibration details/i })).toBeVisible({ timeout: 15_000 })
}

test.describe("Calibración — server-authoritative run state (JAA-648)", () => {
  test("ac3: running state survives reload and is shared across browser contexts", async ({ page, browser }: { page: Page; browser: Browser }) => {
    const period = currentPeriod()
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await seedRunning(page, "mexico", period)

    // Context A: the seeded run is shown as running.
    await login(page)
    await navigateTo(page, "Calibración", /calibration/)
    await expectMexicoRunning(page)

    // Full reload via a fresh login (dev auth lives in React state, so login()
    // re-loads the SPA from scratch with no prior client state) — the running
    // state can only come from the backend.
    await login(page)
    await navigateTo(page, "Calibración", /calibration/)
    await expectMexicoRunning(page)

    // Second, independent browser context (separate storage/cookies): it must see
    // the same running state because it is server-authoritative, not per-browser.
    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()
    await setModuleConfig(pageB, {})
    await login(pageB)
    await navigateTo(pageB, "Calibración", /calibration/)
    await expectMexicoRunning(pageB)
    await ctxB.close()
  })

  test("ac4: a stale legacy localStorage key is ignored and cleared", async ({ page }: { page: Page }) => {
    const period = currentPeriod()
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    // Backend has a real running run...
    await seedRunning(page, "mexico", period)
    // ...while the browser carries a STALE legacy mapping pointing at a job that
    // does not exist. If the app trusted it, the card would not show "running".
    await page.addInitScript(
      ([key]) => {
        window.localStorage.setItem(key, JSON.stringify({ mexico: "stale-nonexistent-job" }))
      },
      [LEGACY_KEY],
    )

    await login(page)
    await navigateTo(page, "Calibración", /calibration/)

    // The app derived the running state from the backend, ignoring the stale key.
    await expectMexicoRunning(page)

    // ...and the legacy key was cleared one-time on mount.
    const remaining = await page.evaluate((key) => window.localStorage.getItem(key), LEGACY_KEY)
    expect(remaining).toBeNull()
  })
})

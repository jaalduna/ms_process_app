import { test, expect } from "@playwright/test"
import type { Page, Locator } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * JAA-776 — animated "Ejecutándose" badge (card + list view) and the
 * page-header "N en ejecución" chip. The first test seeds a frozen running
 * run via POST /test/seed-calibration-run (mirrors calibration-runs.spec.ts's
 * JAA-648 pattern) so the badge/chip assertions don't race the mock's step
 * interval; the second drives a real trigger to prove the chip disappears
 * once the job completes.
 */

/** Mirror CalibrationPage.currentPeriod(): the previous calendar month, YYYYMM. */
function currentPeriod(): string {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${prev.getFullYear()}${String(prev.getMonth() + 1).padStart(2, "0")}`
}

function countryCard(page: Page, name: string): Locator {
  return page.locator('[data-slot="card"]').filter({ hasText: name }).first()
}

async function seedRunning(page: Page, country: string, period: string) {
  const res = await page.request.post(`${MOCK_API_BASE}/test/seed-calibration-run`, {
    data: { country, period },
  })
  expect(res.ok()).toBeTruthy()
}

/** Mirrors the confirmAction helper in calibration.spec.ts — radix AlertDialog
 *  animations sometimes swallow a too-early click. */
async function confirmAction(page: Page, trigger: Locator, actionName: RegExp) {
  const dialog = page.getByRole("alertdialog")
  for (let attempt = 0; attempt < 4; attempt++) {
    if (!(await dialog.isVisible().catch(() => false))) {
      await trigger.click({ timeout: 8_000 }).catch(() => {})
      if (!(await dialog.isVisible({ timeout: 3_000 }).catch(() => false))) continue
    }
    await page.waitForTimeout(300)
    await dialog.getByRole("button", { name: actionName }).click({ timeout: 8_000 }).catch(() => {})
    if (await dialog.isHidden({ timeout: 5_000 }).catch(() => false)) return
  }
  throw new Error(`confirmAction(${actionName}) did not complete`)
}

test.describe("Calibración — running status badge + header chip (JAA-776)", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
  })

  test("ac2+ac3: 'Ejecutándose' badge in card + list view, and header chip, while a run is seeded as running", { tag: "@smoke" }, async ({ page }) => {
    const period = currentPeriod()
    await seedRunning(page, "mexico", period)

    await login(page)
    await navigateTo(page, "Calibración", /calibration/)

    // Header chip: count + Mexico's flag.
    await expect(page.getByText(/1 en ejecución/)).toBeVisible({ timeout: 15_000 })

    // Card view badge.
    const card = countryCard(page, "Mexico")
    await expect(card.getByText("Ejecutándose")).toBeVisible({ timeout: 15_000 })

    // List view badge (Resultado column).
    await page.getByRole("button", { name: "Lista" }).click()
    await expect(page.getByRole("table")).toBeVisible({ timeout: 10_000 })
    const row = page.getByRole("button", { name: /view calibration history for mexico/i })
    await expect(row.getByText("Ejecutándose")).toBeVisible({ timeout: 15_000 })
  })

  test("ac3: chip is absent when nothing is running", { tag: "@smoke" }, async ({ page }) => {
    await login(page)
    await navigateTo(page, "Calibración", /calibration/)
    await expect(page.locator('[data-slot="card"]').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/en ejecución/)).toHaveCount(0)
  })

  // Uses a seeded (frozen) running job rather than a live trigger: with the
  // fast mock step interval a triggered Mexico job can finish in ~1-2s, racing
  // the confirm-dialog helper and making a "still running" assertion flaky.
  // Stopping the seeded run is a real, user-driven transition out of
  // running/pending — the same code path a natural completion exercises.
  test("ac3: header chip disappears once the running job stops", async ({ page }) => {
    const period = currentPeriod()
    await seedRunning(page, "mexico", period)

    await login(page)
    await navigateTo(page, "Calibración", /calibration/)
    await expect(page.getByText(/1 en ejecución/)).toBeVisible({ timeout: 15_000 })

    const card = countryCard(page, "Mexico")
    const stop = card.getByRole("button", { name: /stop calibration/i })
    await confirmAction(page, stop, /^Stop$/)

    await expect(card.getByText("Cancelled")).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/en ejecución/)).toHaveCount(0)
  })
})

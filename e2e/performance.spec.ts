import { test, expect, Page } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

const API_BASE = MOCK_API_BASE

/**
 * Warm up the browser's HTTP connection to the backend for API-only tests.
 *
 * On Windows, the first TCP connection from Chromium can be slow due to
 * proxy auto-detection (WPAD). The --no-proxy-server browser flag mitigates
 * this, but we still prime the connection with a lightweight fetch.
 */
async function warmUpForApi(page: Page): Promise<void> {
  await page.evaluate((base) => fetch(`${base}/events`).then(() => undefined), API_BASE)
}

test.describe("Performance Validation", () => {
  test.describe.configure({ mode: "serial" })

  test("API /events responds under 5 seconds (cold start target)", { tag: "@smoke" }, async ({ page }) => {
    await warmUpForApi(page)

    const start = Date.now()
    const response = await page.request.get(`${API_BASE}/events`)
    const elapsed = Date.now() - start

    expect(response.ok()).toBeTruthy()
    const body = await response.json()
    expect(body.items.length).toBeGreaterThan(0)
    expect(body.total).toBeGreaterThan(0)

    console.log(`[PERF] /events cold start: ${elapsed}ms (target: <5000ms)`)
    expect(elapsed).toBeLessThan(5000)
  })

  test("API /events responds under 3 seconds on subsequent calls", { tag: "@smoke" }, async ({ page }) => {
    await warmUpForApi(page)
    // Prime page.request path
    await page.request.get(`${API_BASE}/events`)

    const times: number[] = []
    for (let i = 0; i < 3; i++) {
      const start = Date.now()
      const response = await page.request.get(`${API_BASE}/events`)
      const elapsed = Date.now() - start
      times.push(elapsed)
      expect(response.ok()).toBeTruthy()
    }

    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length)
    const max = Math.max(...times)
    console.log(`[PERF] /events subsequent: avg=${avg}ms max=${max}ms (target: <3000ms)`)

    for (const t of times) {
      expect(t).toBeLessThan(3000)
    }
  })

  test("API /events/{id} detail responds under 3 seconds", { tag: "@smoke" }, async ({ page }) => {
    await warmUpForApi(page)

    const listResp = await page.request.get(`${API_BASE}/events`)
    const list = await listResp.json()
    expect(list.items.length).toBeGreaterThan(0)
    const jobId = list.items[0].job_id

    const start = Date.now()
    const detailResp = await page.request.get(`${API_BASE}/events/${jobId}`)
    const elapsed = Date.now() - start

    expect(detailResp.ok()).toBeTruthy()
    const detail = await detailResp.json()
    expect(detail.job_id).toBe(jobId)

    console.log(`[PERF] /events/${jobId}: ${elapsed}ms (target: <3000ms)`)
    expect(elapsed).toBeLessThan(3000)
  })

  // JAA-411: quarantined (stale/aspirational selector vs current DOM) — repair or port to vitest.
  // The retired sync-centric "history" page no longer exists; the post-login
  // landing is the Overview pipeline page. This measures that the authenticated
  // landing renders its data-backed table within a sensible budget.
  test("Overview landing renders the pipeline table fast", { tag: "@smoke" }, async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)

    const start = Date.now()
    await login(page)
    await navigateTo(page, "Overview", /overview/)

    // The overview table is populated from the metadata + per-stage last-completion
    // endpoints; wait for the country rows to render.
    const table = page.getByRole("table")
    await expect(table).toBeVisible({ timeout: 10_000 })
    await expect(table.locator("tbody tr").first()).toBeVisible({ timeout: 5_000 })
    const elapsed = Date.now() - start

    expect(await table.locator("tbody tr").count()).toBe(9)
    console.log(`[PERF] Overview rendered in ${elapsed}ms (target: <10000ms)`)
    expect(elapsed).toBeLessThan(10_000)
  })
})

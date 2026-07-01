import { test, expect, type Page } from "@playwright/test"
import { login } from "./helpers/auth"
import { MOCK_API_BASE } from "./helpers/config"

/**
 * Feature-flag silencing (JAA-558).
 *
 * The SPA used to call POST /telemetry/events and GET /processes/status on every
 * page. Against backends that don't implement them (the real ms-process-api)
 * those produce a steady stream of 405/404 console errors. The fix gates both
 * callers behind window.__APP_CONFIG__.features so the real-API deploy configs
 * can turn them off — then the SPA makes ZERO such requests (the browser only
 * logs a console error for a request that is actually sent).
 *
 * ac1: features off  → no telemetry/events, no telemetry/errors, no
 *      processes/status requests, and no console errors matching those patterns.
 * ac2: features on (default) → both fire normally against the mock (202 / 200)
 *      with no console errors — i.e. the guard doesn't break the happy path.
 */

const MOCK_SERVER_PORT = Number(process.env.MOCK_SERVER_PORT) || 5000

const SILENCED = [/\/telemetry\/events/, /\/telemetry\/errors/, /\/processes\/status/]

const ALL_MODULES = {
  overview: true,
  sync: false,
  calibration: true,
  elegibilidad: true,
  prices: true,
  weighting: true,
  mtr: true,
  traceability: true,
}

/** Replace config.js so __APP_CONFIG__ carries the given feature flags. */
async function setFeatureConfig(page: Page, features: Record<string, boolean>) {
  await page.route("**/config.js", (route) => {
    route.fulfill({
      contentType: "application/javascript",
      body: [
        `window.__BRIDGE_CONFIG__ = { API_URL: "http://127.0.0.1:${MOCK_SERVER_PORT}/api/v1" };`,
        `window.__APP_CONFIG__ = { modules: ${JSON.stringify(ALL_MODULES)}, features: ${JSON.stringify(features)} };`,
      ].join("\n"),
    })
  })
}

test.describe("Feature flags — silence unimplemented endpoints", () => {
  test.beforeEach(async ({ page }) => {
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
  })

  test(
    "features off: no telemetry/processes-status requests or console errors",
    { tag: "@smoke" },
    async ({ page }) => {
      await setFeatureConfig(page, { telemetry: false, processStatus: false })

      const silencedRequests: string[] = []
      page.on("request", (req) => {
        if (SILENCED.some((re) => re.test(req.url()))) silencedRequests.push(req.url())
      })
      const consoleErrors: string[] = []
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text())
      })

      // Load + walk the app (incl. calibration) so any poller/telemetry would fire.
      await login(page)
      await expect(page).toHaveURL(/\/overview/, { timeout: 15_000 })
      await page
        .getByRole("navigation", { name: /main navigation/i })
        .getByRole("link", { name: "Precios" })
        .click()
      await expect(page).toHaveURL(/\/precios/, { timeout: 15_000 })
      await page
        .getByRole("navigation", { name: /main navigation/i })
        .getByRole("link", { name: /calibraci/i })
        .click()
      await expect(page).toHaveURL(/\/calibration/, { timeout: 15_000 })

      // Wait past telemetry debounce (1s) + a process-status poll interval (30s
      // is the refetch cadence, but the disabled query also skips the *initial*
      // fetch, which is what we assert) — 4s is enough to catch any initial call.
      await page.waitForTimeout(4_000)

      expect(silencedRequests, `unexpected calls: ${silencedRequests.join(", ")}`).toHaveLength(0)
      const offending = consoleErrors.filter((t) =>
        /telemetry\/events|telemetry\/errors|processes\/status/.test(t),
      )
      expect(offending, `console errors: ${offending.join(" | ")}`).toHaveLength(0)
    },
  )

  test(
    "features on (default): telemetry + process-status fire, no console errors",
    { tag: "@smoke" },
    async ({ page }) => {
      await setFeatureConfig(page, { telemetry: true, processStatus: true })

      const consoleErrors: string[] = []
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text())
      })

      // The poller fires on mount; capture it.
      const statusResponse = page.waitForResponse(
        (r) => /\/processes\/status/.test(r.url()) && r.request().method() === "GET",
        { timeout: 15_000 },
      )

      await login(page)
      await expect(page).toHaveURL(/\/overview/, { timeout: 15_000 })

      // Telemetry flush triggered by a nav click (interaction + page_view).
      const eventsResponse = page.waitForResponse(
        (r) => r.url().endsWith("/telemetry/events") && r.request().method() === "POST",
        { timeout: 15_000 },
      )
      await page
        .getByRole("navigation", { name: /main navigation/i })
        .getByRole("link", { name: "Precios" })
        .click()

      expect((await statusResponse).status()).toBe(200)
      expect((await eventsResponse).status()).toBe(202)

      const offending = consoleErrors.filter((t) =>
        /telemetry\/events|telemetry\/errors|processes\/status/.test(t),
      )
      expect(offending, `console errors: ${offending.join(" | ")}`).toHaveLength(0)
    },
  )
})

import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * Telemetry e2e (JAA-429). Verifies the running app actually emits usage
 * analytics and error reports to the mock collector:
 *   - navigating + clicking → POST /telemetry/events (202)
 *   - a forced runtime error → POST /telemetry/errors (202)
 */
test.describe("Telemetry", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
  })

  test("navigating between pages emits POST /telemetry/events (202)", { tag: "@smoke" }, async ({ page }) => {
    await login(page)
    await expect(page).toHaveURL(/\/overview/, { timeout: 15_000 })

    // Click a tagged nav link (interaction) which also changes route (page_view),
    // then the debounced batch flushes to the events collector.
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith("/telemetry/events") && r.request().method() === "POST",
        { timeout: 15_000 },
      ),
      page.getByRole("navigation", { name: /main navigation/i }).getByRole("link", { name: "Precios" }).click(),
    ])

    // Assert request-side only. The events batch is POSTed via fetch({keepalive:true}),
    // whose response body is NOT readable from the page context — `await response.json()`
    // hangs until the test times out (JAA-627). status()/postDataJSON() come off the
    // request/response metadata Playwright already holds, so they never touch the body.
    expect(response.status()).toBe(202)

    // The flushed batch carries the events we expect.
    const sent = response.request().postDataJSON() as { events: Array<{ type: string; name?: string }> }
    const types = sent.events.map((e) => e.type)
    expect(types).toContain("page_view")
    expect(types).toContain("interaction")
  })

  test("a runtime error emits POST /telemetry/errors (202)", { tag: "@smoke" }, async ({ page }) => {
    await login(page)
    await expect(page).toHaveURL(/\/overview/, { timeout: 15_000 })

    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith("/telemetry/errors") && r.request().method() === "POST",
        { timeout: 15_000 },
      ),
      page.evaluate(() => {
        window.dispatchEvent(
          new ErrorEvent("error", { message: "e2e-forced-error", error: new Error("e2e-forced-error") }),
        )
      }),
    ])

    expect(response.status()).toBe(202)
    const sent = response.request().postDataJSON() as { errors: Array<{ kind: string; message: string }> }
    expect(sent.errors[0].kind).toBe("error")
    expect(sent.errors[0].message).toContain("e2e-forced-error")
  })
})

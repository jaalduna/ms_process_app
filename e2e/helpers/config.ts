import { Page } from "@playwright/test"

/** The mock server port (must match mock-server/server.js; override for worktree isolation). */
const MOCK_SERVER_PORT = Number(process.env.MOCK_SERVER_PORT) || 5000

/**
 * Override the app's module config by intercepting `config.js` via route.
 *
 * Uses `page.route()` to replace the response of `public/config.js` with a
 * custom version. This is more reliable than `page.addInitScript()` because
 * `config.js` is loaded as a `<script>` tag in `index.html` and would
 * overwrite any earlier `window.__APP_CONFIG__` set by init scripts.
 *
 * Must be called **before** `page.goto()` so the interception is active.
 *
 * @param page - Playwright page
 * @param modules - partial module toggle overrides (e.g., `{ prices: false }`)
 */
export async function setModuleConfig(
  page: Page,
  modules: Partial<Record<string, boolean>>,
) {
  const allModules = {
    // Mirror production public/config.js: sync is disabled by default, so the
    // post-login redirect (LoginPage → /dashboard → defaultRoute) lands on the
    // Overview page instead of the retired sync dashboard. Specs that need the
    // sync module pass `{ sync: true }` explicitly.
    overview: true,
    sync: false,
    calibration: true,
    elegibilidad: true,
    prices: true,
    weighting: true,
    mtr: true,
    traceability: true,
    ...modules,
  }

  await page.route("**/config.js", (route) => {
    route.fulfill({
      contentType: "application/javascript",
      body: [
        `window.__BRIDGE_CONFIG__ = { API_URL: "http://127.0.0.1:${MOCK_SERVER_PORT}/api/v1" };`,
        `window.__APP_CONFIG__ = { modules: ${JSON.stringify(allModules)} };`,
      ].join("\n"),
    })
  })
}

/** The base URL for the mock server API (for direct HTTP calls in tests). */
export const MOCK_API_BASE = `http://127.0.0.1:${MOCK_SERVER_PORT}/api/v1`

/** The mock server origin (no /api/v1) — health endpoints are mounted at root. */
export const MOCK_ORIGIN = `http://127.0.0.1:${MOCK_SERVER_PORT}`

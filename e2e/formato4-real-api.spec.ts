import { test, expect } from "@playwright/test"
import type { Page, Locator } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"

/**
 * Formato 4 e2e against the REAL ms-process-api in fake mode (MTR-62) — the
 * browser-level half of MTR-39.
 *
 * Unlike `formato4.spec.ts` (which drives the Node mock-server on :5000), this
 * spec points the app at a REAL `ms-process-api` started with
 * `DATABRICKS_FAKE=true` (auto-progressing `AutoFakeDatabricksClient`, no
 * cluster). It is the integration gate that catches mock-vs-real divergence
 * between the E3 Node mock and the actual API the UI consumes — e.g. the real
 * download is `format_4_<country>.csv.zip` (no `_<period>` suffix the mock
 * adds), the real backend has no `/test/reset` and no `/metadata/last-formato4`.
 *
 * RUNBOOK (manual integration gate; CI can't host the Python backend yet — see
 * the ticket's acceptance note):
 *   1. In ms-process-api (a checkout with the MTR-39 fake mode), start the API
 *      with a FRESH registry so state is clean (the real backend has no reset):
 *        DATABRICKS_FAKE=true DATABRICKS_FAKE_STEP_SECONDS=0.3 AUTH_ENABLED=false \
 *        RUN_REGISTRY_DB_PATH=$(mktemp -d)/reg.db PARAMS_CONFIGS_DIR=$(mktemp -d) \
 *        poetry run uvicorn ms_process_api.main:app --host 127.0.0.1 --port 8000
 *   2. In ms_process_app, start the dev server:  npm run dev:e2e
 *   3. Run this spec pointed at the real API:
 *        REAL_BACKEND=http://127.0.0.1:8000 npx playwright test e2e/formato4-real-api.spec.ts
 *
 * Without `REAL_BACKEND` set the spec SELF-SKIPS, so the default backend-less
 * `npx playwright test` (mock) run stays green and never executes it.
 */

const REAL_BACKEND = process.env.REAL_BACKEND
const REAL_API_BASE = `${REAL_BACKEND ?? "http://127.0.0.1:8000"}/api/v1`

// The country to drive. Its lowercase code is also the backend's zip basename
// segment: the real API streams `format_4_<code>.csv.zip`.
const COUNTRY_CODE = "chile"
const COUNTRY_LABEL = "Chile"

/**
 * Override the app's runtime config (`config.js`) to point the API base at the
 * REAL fake-mode backend instead of the Node mock. Mirrors
 * `e2e/helpers/config.ts:setModuleConfig` but targets `REAL_API_BASE`.
 * Must be called BEFORE `page.goto()`.
 */
async function pointAtRealBackend(page: Page) {
  await page.route("**/config.js", (route) => {
    route.fulfill({
      contentType: "application/javascript",
      body: [
        `window.__BRIDGE_CONFIG__ = { API_URL: "${REAL_API_BASE}" };`,
        `window.__APP_CONFIG__ = { modules: { overview: true, formato4: true } };`,
      ].join("\n"),
    })
  })
}

/** The country card (a [data-slot="card"]) by its visible country label. */
function card(page: Page, label: string): Locator {
  return page.locator('[data-slot="card"]', { hasText: label })
}

/** Confirm a radix AlertDialog action robustly (radix animates on open). */
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

/** The detail (eye) button — renders once a run leaves "pending". */
function eyeButton(c: Locator): Locator {
  return c.getByRole("button", { name: /Ver detalle/ })
}

/**
 * Trigger a Formato 4 run and confirm it actually started (mirrors
 * formato4.spec.ts:startFormato4): a single radix confirm can race the
 * animation, so retry until the eye button (the run left "pending") appears.
 */
async function startFormato4(page: Page, c: Locator) {
  const eye = eyeButton(c)
  const ejecutar = c.getByRole("button", { name: /^Ejecutar$/ })
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await eye.isVisible().catch(() => false)) return
    if (!(await ejecutar.isEnabled({ timeout: 10_000 }).catch(() => false))) continue
    await confirmAction(page, ejecutar, /^Confirm$/).catch(() => {})
    if (await eye.isVisible({ timeout: 8_000 }).catch(() => false)) return
  }
  throw new Error("Formato 4 run did not start")
}

test.describe("Formato 4 E2E against the REAL fake-mode ms-process-api", () => {
  test.skip(
    !REAL_BACKEND,
    "Set REAL_BACKEND (e.g. http://127.0.0.1:8000) to a running fake-mode ms-process-api to run this integration gate.",
  )

  test.beforeEach(async ({ page }) => {
    await pointAtRealBackend(page)
    await login(page)
  })

  test("drives a country to Completado and downloads the server zip", async ({ page }) => {
    await navigateTo(page, "Formato 4", /formato4/)

    const country = card(page, COUNTRY_LABEL)
    await expect(country).toBeVisible({ timeout: 15_000 })

    await startFormato4(page, country)

    // The auto-progressing fake backend advances the run to the terminal badge.
    await expect(country.getByText(/Completado/i)).toBeVisible({ timeout: 60_000 })

    const downloadBtn = country.getByRole("button", { name: /Descargar/ })
    await expect(downloadBtn).toBeVisible({ timeout: 10_000 })

    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 })
    await downloadBtn.click()
    const download = await downloadPromise

    // Decisive contract pin: the REAL API streams format_4_<country>.csv.zip with
    // NO _<period> suffix (the Node mock appends one) — this is exactly the
    // mock-vs-real divergence this gate exists to catch.
    expect(download.suggestedFilename()).toBe(`format_4_${COUNTRY_CODE}.csv.zip`)
  })
})

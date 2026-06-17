import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

test.describe("Navigation and Module Toggle E2E", () => {
  test("all module nav items visible when all modules enabled", { tag: "@smoke" }, async ({ page }) => {
    // Enable every module, including the off-by-default sync module.
    await setModuleConfig(page, {
      sync: true,
      calibration: true,
      elegibilidad: true,
      prices: true,
      weighting: true,
      mtr: true,
      traceability: true,
    })
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)

    const nav = page.getByRole("navigation", { name: /main navigation/i })
    await expect(nav).toBeVisible({ timeout: 10_000 })

    // Every registered module's nav link is present (exact labels from the
    // module registry). Sync renders as "Sincronización".
    const labels = [
      "Overview",
      "Sincronización",
      "Precios",
      "Elegibilidad",
      "Pesaje",
      "Calibración",
      "MTR",
      "Trazabilidad",
      "Admin",
    ]
    for (const label of labels) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible({ timeout: 5_000 })
    }
  })

  test("disabled module is hidden from navigation", { tag: "@smoke" }, async ({ page }) => {
    // Disable the prices module (others stay at their defaults).
    await setModuleConfig(page, { prices: false })
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)

    const nav = page.getByRole("navigation", { name: /main navigation/i })
    await expect(nav).toBeVisible({ timeout: 10_000 })

    // "Precios" must NOT be in the navigation...
    await expect(nav.getByRole("link", { name: "Precios" })).toHaveCount(0)
    // ...while other enabled modules still are.
    await expect(nav.getByRole("link", { name: "Elegibilidad" })).toBeVisible({ timeout: 5_000 })
  })

  // Route-redirect behaviours (catch-all → default module, disabled-module route
  // → default) are intentionally NOT e2e tests: the dev auth state is in-memory
  // only (DevAuthProvider useState), so a hard page.goto() to a deep route logs
  // the session out before the SPA router runs. They are guaranteed by
  // construction — App.tsx only registers <Route>s for enabled modules and a
  // catch-all <Navigate to={defaultRoute}> — and the disabled-module case is
  // already covered above by "disabled module is hidden from navigation".
})

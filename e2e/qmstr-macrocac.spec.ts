import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * Smoke coverage for the QMS-TR page (its own /qms_tr backed model as of
 * JAA-987/JAA-988, no longer an MTR clone) at /qms-tr, the retained MTR page
 * (/mtr), and the PythonCac form (/macrocac, on-demand publish to
 * productive SQL tables). Nav-click navigation is used instead of page.goto
 * because the dev auth state is in-memory and a hard reload logs the session out.
 *
 * Ojo con el nombre: de cara al usuario el módulo es "PythonCac", pero el `id`,
 * la ruta `/macrocac` y los `data-testid` siguen diciendo `macrocac` — son el
 * contrato con el backend y con los tests. Ver `src/modules/macrocac/index.ts`.
 */
test.describe("QMS-TR / MTR / PythonCac", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, { mtr: true, qmstr: true, macrocac: true })
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
  })

  test("new nav items are present alongside MTR", { tag: "@smoke" }, async ({ page }) => {
    const nav = page.getByRole("navigation", { name: /main navigation/i })
    await expect(nav).toBeVisible({ timeout: 10_000 })
    await expect(nav.getByRole("link", { name: "MTR", exact: true })).toBeVisible()
    await expect(nav.getByRole("link", { name: "QMS-TR", exact: true })).toBeVisible()
    await expect(nav.getByRole("link", { name: "PythonCac", exact: true })).toBeVisible()
  })

  test("QMS-TR page renders a country grid under its own heading", { tag: "@smoke" }, async ({ page }) => {
    const nav = page.getByRole("navigation", { name: /main navigation/i })
    await nav.getByRole("link", { name: "QMS-TR", exact: true }).click()
    await expect(page).toHaveURL(/\/qms-tr$/, { timeout: 10_000 })
    await expect(page.getByRole("heading", { name: "QMS-TR", exact: true })).toBeVisible({ timeout: 10_000 })
    // At least one country card with its own ano_base input + trigger button.
    await expect(page.getByRole("button", { name: /^Ejecutar$/ }).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel("Año base").first()).toBeVisible()
  })

  test("MTR page is still reachable at /mtr with its own heading", { tag: "@smoke" }, async ({ page }) => {
    const nav = page.getByRole("navigation", { name: /main navigation/i })
    await nav.getByRole("link", { name: "MTR", exact: true }).click()
    await expect(page).toHaveURL(/\/mtr$/, { timeout: 10_000 })
    await expect(page.getByRole("heading", { name: "MTR", exact: true })).toBeVisible({ timeout: 10_000 })
  })

  test("PythonCac shows the productive-table correction form", { tag: "@smoke" }, async ({ page }) => {
    const nav = page.getByRole("navigation", { name: /main navigation/i })
    await nav.getByRole("link", { name: "PythonCac", exact: true }).click()
    await expect(page).toHaveURL(/\/macrocac$/, { timeout: 10_000 })
    await expect(page.getByRole("heading", { name: "PythonCac", exact: true })).toBeVisible({ timeout: 10_000 })
    // El selector de tabla pasó a ser un combobox buscable con las tablas que
    // el backend resuelve por patrón; ya no es el `<select>` fijo de JAA-1051.
    await expect(page.getByTestId("macrocac-tabla-combobox")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId("macrocac-pais-select")).toBeVisible()
    // Arranca en una copia de trabajo `_test*`, nunca en la productiva: por eso
    // se espera el aviso de sandbox y NO el de producción.
    await expect(page.getByTestId("macrocac-sandbox-hint")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId("macrocac-produccion-warning")).toHaveCount(0)
  })
})

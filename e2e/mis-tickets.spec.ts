import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * JAA-769 — "Mis tickets" page. Verified against the mock-server's
 * GET /feedback/mine (parent JAA-768). Guards: empty state, a submitted
 * ticket shows up with its status, and newest-first ordering.
 */
test.describe("Mis tickets", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
  })

  test("empty state is shown when no feedback was submitted", { tag: "@smoke" }, async ({ page }) => {
    await login(page)
    await expect(page).toHaveURL(/\/overview/, { timeout: 15_000 })

    await navigateTo(page, "Mis tickets", /\/mis-tickets/)
    await expect(
      page.getByText("Todavía no enviaste ningún feedback."),
    ).toBeVisible()
  })

  test("a submitted ticket appears with a todo status", { tag: "@smoke" }, async ({ page }) => {
    await login(page)
    await expect(page).toHaveURL(/\/overview/, { timeout: 15_000 })

    await page.getByRole("button", { name: "Enviar feedback" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Mensaje").fill("Necesito ayuda con la calibración")
    await dialog.getByRole("button", { name: /^Enviar$/ }).click()
    await expect(page.getByText(/Tu ticket es FB-\d{6}/)).toBeVisible({ timeout: 10_000 })

    await navigateTo(page, "Mis tickets", /\/mis-tickets/)

    await expect(page.getByText("Necesito ayuda con la calibración")).toBeVisible()
    await expect(page.getByText("Por hacer")).toBeVisible()
  })

  test("two submitted tickets both appear, newest first", { tag: "@smoke" }, async ({ page }) => {
    await login(page)
    await expect(page).toHaveURL(/\/overview/, { timeout: 15_000 })

    for (const message of ["Primer reporte de bug", "Segundo reporte de bug"]) {
      await page.getByRole("button", { name: "Enviar feedback" }).click()
      const dialog = page.getByRole("dialog")
      await dialog.getByLabel("Mensaje").fill(message)
      await dialog.getByRole("button", { name: /^Enviar$/ }).click()
      await expect(page.getByText(/Tu ticket es FB-\d{6}/)).toBeVisible({ timeout: 10_000 })
    }

    await navigateTo(page, "Mis tickets", /\/mis-tickets/)

    const firstMessage = page.getByText("Primer reporte de bug")
    const secondMessage = page.getByText("Segundo reporte de bug")
    await expect(firstMessage).toBeVisible()
    await expect(secondMessage).toBeVisible()

    // Newest (second submitted) ticket renders first in the DOM.
    const rows = page.locator("tbody tr")
    await expect(rows.first()).toContainText("Segundo reporte de bug")
    await expect(rows.nth(1)).toContainText("Primer reporte de bug")
  })
})

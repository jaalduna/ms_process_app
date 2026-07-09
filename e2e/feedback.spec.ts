import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * JAA-427 — in-app feedback dialog. Verified against the mock-server's
 * POST /feedback (parent JAA-426). Guards: the trigger is reachable from the
 * layout on every page, empty-message validation blocks submit, and a
 * successful submit shows a confirmation toast + closes while the POST carries
 * the auto-attached context (module/path/appVersion).
 */
test.describe("Feedback dialog", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
  })

  test("trigger is reachable from the layout across routes", { tag: "@smoke" }, async ({ page }) => {
    await login(page)
    await expect(page).toHaveURL(/\/overview/, { timeout: 15_000 })

    const trigger = page.getByRole("button", { name: "Enviar feedback" })
    await expect(trigger).toBeVisible()

    // Still present after navigating to another module (no orphan route).
    await navigateTo(page, "Precios", /\/precios/)
    await expect(trigger).toBeVisible()
  })

  test("empty message is blocked with an inline validation error", { tag: "@smoke" }, async ({ page }) => {
    await login(page)
    await expect(page).toHaveURL(/\/overview/, { timeout: 15_000 })

    await page.getByRole("button", { name: "Enviar feedback" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()

    // Submit with no message → inline error, dialog stays open, no POST fires.
    let posted = false
    page.on("request", (r) => {
      if (r.url().includes("/feedback") && r.method() === "POST") posted = true
    })
    await dialog.getByRole("button", { name: /^Enviar$/ }).click()

    await expect(page.getByText("El mensaje es obligatorio.")).toBeVisible()
    await expect(dialog).toBeVisible()
    expect(posted).toBe(false)
  })

  test("successful submit shows confirmation and POSTs context", { tag: "@smoke" }, async ({ page }) => {
    await login(page)
    await expect(page).toHaveURL(/\/overview/, { timeout: 15_000 })

    await page.getByRole("button", { name: "Enviar feedback" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()

    await dialog.getByLabel("Mensaje").fill("La app funciona muy bien")

    const reqPromise = page.waitForRequest(
      (r) => r.url().includes("/feedback") && r.method() === "POST",
    )
    await dialog.getByRole("button", { name: /^Enviar$/ }).click()

    const request = await reqPromise
    const body = request.postDataJSON()
    expect(body.message).toBe("La app funciona muy bien")
    expect(body.category).toBe("bug")
    expect(body.context).toBeTruthy()
    expect(typeof body.context.module).toBe("string")
    expect(body.context.path).toMatch(/overview/)
    expect(typeof body.context.appVersion).toBe("string")
    expect(body.context.appVersion.length).toBeGreaterThan(0)
    expect(body.context.sessionId).toBeTruthy()
    expect(typeof body.context.sessionId).toBe("string")

    // Confirmation toast + dialog closes.
    await expect(page.getByText(/Tu ticket es FB-\d{6}/)).toBeVisible({ timeout: 10_000 })
    await expect(dialog).not.toBeVisible()
  })
})

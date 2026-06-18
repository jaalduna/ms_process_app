import { test, expect } from "@playwright/test"
import type { Page, Locator } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * Pesaje (weighting) module E2E. Mirrors the real WeightingCountryCard DOM:
 * trigger = "Ejecutar"/"Re-ejecutar" → AlertDialog "Confirmar ejecucion" →
 * "Confirmar"; processing shows "Procesando..." + "Detener"; completed runs
 * surface "Ver detalle" → the detail modal with the "Estadisticas de Pesos"
 * summary. The config dialog opens from the header "Parametros de pesaje" button.
 *
 * Cancel-from-running is covered by a vitest component test
 * (src/__tests__/WeightingCountryCard.test.tsx): the "Detener" control only
 * renders while a run is "running", and under the fast mock a run completes
 * before a UI click can land, so it can't be exercised deterministically here.
 */

/** The country card by its visible label. The card text glues the label to the
 *  next token (e.g. "Chilenever…"), so match on a plain substring, not a \b regex. */
function card(page: Page, label: string): Locator {
  return page.locator('[data-slot="card"]').filter({ hasText: label }).first()
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

/**
 * Trigger a weighting run and confirm it started. Success signal = the
 * "Ver detalle" button, which renders once a run leaves "pending" and survives
 * running→completed.
 */
async function startWeighting(page: Page, c: Locator) {
  const verDetalle = c.getByRole("button", { name: /ver detalle/i })
  const ejecutar = c.getByRole("button", { name: /^(Ejecutar|Re-ejecutar)$/ })
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await verDetalle.isVisible().catch(() => false)) return
    if (!(await ejecutar.isEnabled({ timeout: 10_000 }).catch(() => false))) continue
    await confirmAction(page, ejecutar, /^Confirmar$/).catch(() => {})
    if (await verDetalle.isVisible({ timeout: 8_000 }).catch(() => false)) return
  }
  throw new Error("weighting run did not start")
}

test.describe("Weighting Module E2E", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
  })

  test("page loads with country cards", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Pesaje", /pesaje/)
    const cards = page.locator('[data-slot="card"]')
    await expect(cards.first()).toBeVisible({ timeout: 10_000 })
    expect(await cards.count()).toBe(9)
  })

  test("config dialog opens and accepts parameter changes", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Pesaje", /pesaje/)

    // The header settings button opens the global weighting-params dialog.
    await page.getByRole("button", { name: "Parametros de pesaje" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await expect(dialog.getByText(/Parametros de Pesaje/i)).toBeVisible()

    // It exposes editable param fields; change a numeric one.
    const maxRounds = dialog.getByLabel("Maximo juntas marginales")
    await expect(maxRounds).toBeVisible()
    await maxRounds.fill("80")
    await expect(maxRounds).toHaveValue("80")

    // Closing the dialog dismisses it.
    await page.keyboard.press("Escape")
    await expect(dialog).not.toBeVisible({ timeout: 5_000 })
  })

  test("trigger runs to completion and shows weight stats", async ({ page }) => {
    await navigateTo(page, "Pesaje", /pesaje/)
    const chile = card(page, "Chile")
    await startWeighting(page, chile)

    // Deterministic mock → terminal "Completado" status badge.
    await expect(chile.getByText(/Completado/i).first()).toBeVisible({ timeout: 30_000 })

    // The detail modal shows the weight summary statistics.
    await chile.getByRole("button", { name: /ver detalle/i }).click()
    const modal = page.getByRole("dialog")
    await expect(modal).toBeVisible({ timeout: 5_000 })
    await expect(modal.getByText(/Estadisticas de Pesos/i)).toBeVisible({ timeout: 10_000 })
    await expect(modal.getByText("Peso medio")).toBeVisible()
    await expect(modal.getByText("Peso mediana")).toBeVisible()
  })

  test("history modal table fits without horizontal scroll", async ({ page }) => {
    await navigateTo(page, "Pesaje", /pesaje/)
    const chile = card(page, "Chile")
    // Need at least one run so the card exposes the "Historial" button.
    await startWeighting(page, chile)
    await expect(chile.getByText(/Completado/i).first()).toBeVisible({ timeout: 30_000 })

    await chile.getByRole("button", { name: "Historial" }).click()
    const modal = page.getByRole("dialog").filter({ hasText: /Historial de Pesaje/i })
    await expect(modal).toBeVisible({ timeout: 5_000 })
    // The table header confirms the run list rendered (not the empty state).
    await expect(modal.getByText("Periodo")).toBeVisible({ timeout: 10_000 })

    // ac1: the dialog content does not overflow horizontally (no annoying scroll).
    const overflow = await modal.evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)

    // ac2: every action button stays within the dialog's right edge (nothing clipped).
    const dialogBox = await modal.boundingBox()
    expect(dialogBox).not.toBeNull()
    const actionButtons = modal.getByRole("button", { name: "Ver detalle" })
    const n = await actionButtons.count()
    expect(n).toBeGreaterThan(0)
    for (let i = 0; i < n; i++) {
      const box = await actionButtons.nth(i).boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x + box!.width).toBeLessThanOrEqual(dialogBox!.x + dialogBox!.width + 1)
    }
  })
})

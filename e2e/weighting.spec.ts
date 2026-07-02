import { test, expect } from "@playwright/test"
import type { Locator } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"
import { card, openCardModal, confirmRun } from "./helpers/weighting"

/**
 * Pesaje (weighting) module E2E, post-JAA-425. The whole country card is the
 * trigger: clicking it opens the detail/config modal, which hosts the editable
 * params, the run button ("Ejecutar"/"Re-ejecutar" → confirm AlertDialog), and —
 * once a run is completed — the "Estadisticas de Pesos" summary + "Descargar CSV".
 * Process close/open lives on the status badge. The mock seeds one completed run
 * per country, so cards land on "Completado" with editable params (process open).
 *
 * Cancel-from-running is covered by a vitest component test
 * (src/__tests__/WeightingCountryCard.test.tsx): the "Detener" control only
 * renders while a run is "running", and under the fast mock a run completes
 * before a UI click can land, so it can't be exercised deterministically here.
 */

/** Run a country from its modal and wait until the card lands on completed. */
async function runToCompletion(page: import("@playwright/test").Page, label: string) {
  const modal = await openCardModal(page, label)
  await confirmRun(page, modal)
  await expect(card(page, label).getByText(/Completado/i).first()).toBeVisible({ timeout: 30_000 })
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

  test("card opens the detail modal with read-only params (JAA-425)", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Pesaje", /pesaje/)

    // JAA-425: clicking the card (no per-card buttons anymore) opens the modal,
    // which shows the published "De ejecución" params read-only (editing is
    // exclusive to the Parametros tab, JAA-793) — not an editable field.
    const modal = await openCardModal(page, "Chile")
    await expect(modal.getByText("MAX_ROUNDS_COLAPSO")).toBeVisible()
    await expect(modal.getByLabel("MAX_ROUNDS_COLAPSO")).toHaveCount(0)

    // Closing the dialog dismisses it.
    await page.keyboard.press("Escape")
    await expect(modal).not.toBeVisible({ timeout: 5_000 })
  })

  test("run from the modal completes and shows weight stats", async ({ page }) => {
    await navigateTo(page, "Pesaje", /pesaje/)
    await runToCompletion(page, "Chile")

    // Reopen the modal → the completed run surfaces the weight summary statistics.
    const modal = await openCardModal(page, "Chile")
    await expect(modal.getByText(/Estadisticas de Pesos/i)).toBeVisible({ timeout: 10_000 })
    await expect(modal.getByText("Peso medio")).toBeVisible()
    await expect(modal.getByText("Peso mediana")).toBeVisible()
  })

  test("history modal table fits without horizontal scroll", async ({ page }) => {
    await navigateTo(page, "Pesaje", /pesaje/)
    const chile = card(page, "Chile")
    await expect(chile).toBeVisible({ timeout: 15_000 })

    // Need at least one run in the displayed period so the card exposes the
    // "Historial" button and the history list is non-empty.
    await runToCompletion(page, "Chile")

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
    const actionButtons: Locator = modal.getByRole("button", { name: "Ver detalle" })
    const n = await actionButtons.count()
    expect(n).toBeGreaterThan(0)
    for (let i = 0; i < n; i++) {
      const box = await actionButtons.nth(i).boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x + box!.width).toBeLessThanOrEqual(dialogBox!.x + dialogBox!.width + 1)
    }
  })

  // JAA-778: the Lista view's Acciones column carries an icon-only Play button
  // that launches the pipeline directly (confirm dialog, no modal) — no visible
  // "Ejecutar"/"Detener"/"Procesando..." text, and Play/Stop are mutually exclusive.
  test("Lista view shows an icon-only Play button per row that launches directly", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Pesaje", /pesaje/)
    await page.getByRole("button", { name: "Lista" }).click()

    const table = page.getByRole("table")
    await expect(table).toBeVisible({ timeout: 10_000 })

    // The row itself has role="button" (whole-row click also opens the modal),
    // so scope the query to it via its aria-label rather than role="row".
    const chileRow = page.getByRole("button", { name: /Abrir detalle de Pesaje para Chile/i })
    const play = chileRow.getByRole("button", { name: "Iniciar pesaje" })
    await expect(play).toBeVisible()
    await expect(chileRow.getByText(/^(Ejecutar|Re-ejecutar|Detener|Procesando\.\.\.)$/)).toHaveCount(0)

    await play.click()
    const dialog = page.getByRole("alertdialog")
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await dialog.getByRole("button", { name: "Iniciar" }).click()

    // Launches directly — no config/detail dialog opens.
    await expect(page.getByRole("dialog")).not.toBeVisible()
    await expect(page.getByText(/Historial de Pesaje/i)).not.toBeVisible()

    // Play is replaced by Stop in the same slot while the run is active.
    await expect(chileRow.getByRole("button", { name: "Detener pesaje" })).toBeVisible({ timeout: 15_000 })
    await expect(chileRow.getByRole("button", { name: "Iniciar pesaje" })).toBeHidden()
  })
})

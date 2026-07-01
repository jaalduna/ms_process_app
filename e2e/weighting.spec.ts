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

  test("card opens the detail modal with editable params (JAA-425)", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Pesaje", /pesaje/)

    // JAA-425: clicking the card (no per-card buttons anymore) opens the modal,
    // which exposes editable param fields (labelled by key); change a numeric one.
    const modal = await openCardModal(page, "Chile")
    const maxRounds = modal.getByLabel("MAX_ROUNDS_COLAPSO")
    await expect(maxRounds).toBeVisible()
    await maxRounds.fill("80")
    await expect(maxRounds).toHaveValue("80")

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

  // JAA-766: the Lista view's Acciones column must carry a visible run trigger —
  // the card relies on a whole-card click + hint text, but the list row had
  // neither, leaving no discoverable way to launch a run.
  test("Lista view shows an Ejecutar button per row that opens the config dialog", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Pesaje", /pesaje/)
    await page.getByRole("button", { name: "Lista" }).click()

    const table = page.getByRole("table")
    await expect(table).toBeVisible({ timeout: 10_000 })

    // The row itself has role="button" (whole-row click also opens the modal),
    // so scope the query to it via its aria-label rather than role="row".
    const chileRow = page.getByRole("button", { name: /Abrir detalle de Pesaje para Chile/i })
    const ejecutar = chileRow.getByRole("button", { name: /^(Ejecutar|Re-ejecutar)$/ })
    await expect(ejecutar).toBeVisible()

    await ejecutar.click()
    const modal = page.getByRole("dialog")
    await expect(modal).toBeVisible({ timeout: 5_000 })
    await expect(modal.getByText("Configurar Pesaje")).toBeVisible()

    // Does not also open the history modal.
    await expect(page.getByText(/Historial de Pesaje/i)).not.toBeVisible()
  })
})

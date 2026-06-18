import { test, expect } from "@playwright/test"
import type { Locator } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"
import { card, openCardModal, confirmRun, confirmDialog, runButton } from "./helpers/weighting"

/**
 * Pesaje iterate loop E2E (JAA-423, updated for JAA-425). The card opens a
 * detail/config modal that drives the loop: open → ajustar params → ejecutar →
 * revisar stats → ajustar → re-ejecutar → cerrar proceso (status badge) →
 * reabrir. Params are per-country/run (edited in the modal, applied on confirm);
 * closing the process disables further runs. The global header gear and the old
 * card-level config / mark-as-ready buttons no longer exist.
 */

/** The process status badge button on a card ("Abierto" / "Cerrado"). */
function statusBadge(c: Locator, label: RegExp): Locator {
  return c.getByRole("button", { name: label })
}

test.describe("Pesaje iterate loop (JAA-423)", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
  })

  test("configure → run → review → adjust → re-run → cerrar → reabrir", async ({ page }) => {
    await navigateTo(page, "Pesaje", /pesaje/)
    const chile = card(page, "Chile")
    await expect(chile).toBeVisible({ timeout: 15_000 })

    // ac3: params are per-country — Argentina's modal shows the default (50),
    // independent of whatever Chile uses.
    const argModal = await openCardModal(page, "Argentina")
    await expect(argModal.getByLabel("MAX_ROUNDS_COLAPSO")).toHaveValue("50")
    await page.keyboard.press("Escape")
    await expect(argModal).not.toBeVisible()

    // ac1: configure Chile's params in its own modal and run with them — the
    // edited value reaches the create body (no global gear, no pre-save step).
    let modal = await openCardModal(page, "Chile")
    await modal.getByLabel("MAX_ROUNDS_COLAPSO").fill("64")
    const [firstRun] = await Promise.all([
      page.waitForRequest(
        (req) => req.method() === "POST" && /\/weighting\/runs(\?|$)/.test(req.url()),
      ),
      confirmRun(page, modal),
    ])
    expect((firstRun.postDataJSON() as { parameters?: Record<string, unknown> }).parameters)
      .toMatchObject({ MAX_ROUNDS_COLAPSO: 64 })
    await expect(chile.getByText(/Completado/i).first()).toBeVisible({ timeout: 30_000 })

    // ac4: after a COMPLETED run the modal shows stats + editable params and
    // "Re-ejecutar" launches a fresh run with the adjusted value.
    modal = await openCardModal(page, "Chile")
    await expect(modal.getByText(/Estadisticas de Pesos/i)).toBeVisible({ timeout: 10_000 })
    await expect(runButton(modal)).toHaveText(/Re-ejecutar/)
    await modal.getByLabel("MAX_ROUNDS_COLAPSO").fill("70")
    await confirmRun(page, modal)
    await expect(chile.getByText(/Completado/i).first()).toBeVisible({ timeout: 30_000 })

    // ac5: cerrar el proceso desde el badge → quedan deshabilitadas las corridas.
    await confirmDialog(page, statusBadge(chile, /^Abierto$/), /^Cerrar proceso$/)
    await expect(statusBadge(chile, /^Cerrado$/)).toBeVisible({ timeout: 10_000 })
    // The modal of a closed process offers no run button.
    const closedModal = await openCardModal(page, "Chile")
    await expect(runButton(closedModal)).toHaveCount(0)
    await page.keyboard.press("Escape")
    await expect(closedModal).not.toBeVisible()

    // Reabrir desde el badge → la iteración vuelve a habilitarse.
    await confirmDialog(page, statusBadge(chile, /^Cerrado$/), /^Abrir proceso$/)
    await expect(statusBadge(chile, /^Abierto$/)).toBeVisible({ timeout: 10_000 })
    const reopened = await openCardModal(page, "Chile")
    await expect(runButton(reopened)).toBeVisible()
  })
})

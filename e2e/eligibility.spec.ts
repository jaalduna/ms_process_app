import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * Eligibility module E2E — exercises the mock-server endpoints added in JAA-358
 * and the multi-phase state machine (execute → results_ready → approve →
 * mordom_ready → upload → mordom_uploaded → apply-mordom → ready).
 */

/**
 * Confirm a radix AlertDialog action robustly. The dialog has an open
 * animation; clicking the action button before it settles intermittently
 * swallows the click. Wait for the dialog, let it settle, then click — and
 * verify the dialog closed (retry once if it didn't take).
 */
/**
 * Open a confirmation AlertDialog via `trigger` and click its action button,
 * robustly. radix dialogs animate on open, so a too-early action click is
 * sometimes swallowed; and the trigger click itself can occasionally not
 * register. Retry handling BOTH: if no dialog is open, (re)click the trigger;
 * once open, settle then click the action; success = the dialog closed.
 */
async function confirmAction(
  page: import("@playwright/test").Page,
  trigger: import("@playwright/test").Locator,
  actionName: RegExp,
) {
  const dialog = page.getByRole("alertdialog")
  for (let attempt = 0; attempt < 4; attempt++) {
    if (!(await dialog.isVisible().catch(() => false))) {
      // Bounded timeout so a momentarily non-actionable trigger fails fast
      // (and we retry) instead of auto-waiting up to the whole test timeout.
      await trigger.click({ timeout: 8_000 }).catch(() => {})
      if (!(await dialog.isVisible({ timeout: 3_000 }).catch(() => false))) continue
    }
    await page.waitForTimeout(300) // let the open animation settle
    await dialog.getByRole("button", { name: actionName }).click({ timeout: 8_000 }).catch(() => {})
    if (await dialog.isHidden({ timeout: 5_000 }).catch(() => false)) return
  }
  throw new Error(`confirmAction(${actionName}) did not complete`)
}

/**
 * Start an eligibility run on a country card and confirm it actually started
 * (the "Ejecutar" button disappears → running/results_ready).
 */
async function startRun(
  page: import("@playwright/test").Page,
  card: import("@playwright/test").Locator,
) {
  const ejecutar = card.getByRole("button", { name: /^Ejecutar$/ })
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!(await ejecutar.isVisible().catch(() => false))) return // already started
    await confirmAction(page, ejecutar, /^Confirmar$/)
    if (await ejecutar.isHidden({ timeout: 8_000 }).catch(() => false)) return
  }
  throw new Error("eligibility run did not start after 3 attempts")
}

test.describe("Eligibility Module E2E", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
  })

  test("page loads with 9 country cards", async ({ page }) => {
    await navigateTo(page, "Elegibilidad", /elegibilidad/)
    const cards = page.locator('[data-slot="card"]')
    await expect(cards.first()).toBeVisible({ timeout: 10_000 })
    expect(await cards.count()).toBe(9)
  })

  test("seeded ready country shows completed detail with steps and files", async ({ page }) => {
    await navigateTo(page, "Elegibilidad", /elegibilidad/)

    const card = page.locator('[data-slot="card"]').filter({ hasText: "Mexico" })
    await expect(card).toBeVisible({ timeout: 10_000 })
    // Seeded run is "ready" → a detail button is available.
    const detailBtn = card.getByRole("button", { name: /ver detalle/i })
    await expect(detailBtn).toBeVisible({ timeout: 10_000 })
    await detailBtn.click()

    const modal = page.getByRole("dialog")
    await expect(modal).toBeVisible({ timeout: 5_000 })
    await expect(modal.getByText(/Detalle Elegibilidad/i)).toBeVisible()
    // All pipeline steps present and the results file is listed.
    await expect(modal.getByText(/Ejecutar Pipeline/i)).toBeVisible()
    await expect(modal.getByText(/\.csv/i).first()).toBeVisible({ timeout: 5_000 })
  })

  test("full lifecycle: execute → approve → upload → apply-mordom → ready", async ({ page }) => {
    await navigateTo(page, "Elegibilidad", /elegibilidad/)

    // Argentina has no seeded run → "Ejecutar" is available.
    const card = page.locator('[data-slot="card"]').filter({ hasText: "Argentina" })
    await expect(card).toBeVisible({ timeout: 10_000 })

    // ── Execute ──
    await startRun(page, card)

    // Running → results_ready (badge text from STATUS_CONFIG).
    await expect(card.getByText(/Resultados listos/i)).toBeVisible({ timeout: 30_000 })

    // ── Approve (in detail modal) ──
    // In results_ready the action row (Re-ejecutar + Revisar resultados +
    // Ver detalle) overflows the card and clips the button (tracked: JAA-360),
    // so dispatch the click directly rather than via hit-testing.
    await card.getByRole("button", { name: /ver detalle/i }).dispatchEvent("click")
    const modal = page.getByRole("dialog")
    await expect(modal).toBeVisible({ timeout: 5_000 })

    await confirmAction(page, modal.getByRole("button", { name: /Aprobar y Aplicar/i }), /^Aprobar$/)

    // applying_sql → mordom_downloading → mordom_ready: upload zone appears.
    const fileInput = modal.locator('input[type="file"]')
    await expect(fileInput).toBeAttached({ timeout: 30_000 })

    // ── Upload corrected MorDom CSV ──
    await fileInput.setInputFiles({
      name: "mordom_corrected.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("household_id,action\nHH-00001,keep\n"),
    })

    // mordom_uploaded → "Aplicar MorDom y Finalizar" appears.
    await confirmAction(page, modal.getByRole("button", { name: /Aplicar MorDom y Finalizar/i }), /Aplicar y Finalizar/i)

    // applying_mordom → ready. The status badge shows "Listo".
    await expect(modal.getByText(/Listo/i).first()).toBeVisible({ timeout: 30_000 })
  })

  test("cancel stops a running eligibility run", async ({ page }) => {
    await navigateTo(page, "Elegibilidad", /elegibilidad/)

    const card = page.locator('[data-slot="card"]').filter({ hasText: "Chile" })
    await expect(card).toBeVisible({ timeout: 10_000 })

    await startRun(page, card)

    // Running → "Detener" button visible.
    const stopBtn = card.getByRole("button", { name: /Detener/i })
    await expect(stopBtn).toBeVisible({ timeout: 15_000 })

    // Confirm via the alert dialog (action button also labelled "Detener").
    await confirmAction(page, stopBtn, /Detener/i)

    await expect(card.getByText(/Cancelado/i)).toBeVisible({ timeout: 10_000 })
  })
})

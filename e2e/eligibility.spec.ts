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
    // The "last completed" badge must reflect the seeded ready run (2d ago), not
    // "never" — last-elegibilidad now sources from the eligibility store (JAA-390).
    await expect(card.getByText(/\d+d ago/)).toBeVisible({ timeout: 10_000 })
    await expect(card.getByText("never")).toHaveCount(0)
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

    // Running → results_ready. The badge signals a pending review gate, NOT
    // completion — it must not read as "listos" (JAA-387).
    await expect(card.getByText(/Pendiente de revisión/i)).toBeVisible({ timeout: 30_000 })
    await expect(card.getByText(/Resultados listos/i)).toHaveCount(0)

    // ── Approve (via the explicit card CTA, JAA-387) ──
    // In results_ready the card surfaces "Revisar y aprobar" which opens the
    // detail modal where the approve action lives.
    await card.getByRole("button", { name: /Revisar y aprobar/i }).click()
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

    // ── Live badge update (JAA-392) ──
    // Close the modal and confirm the card's "last completed" badge flips from
    // "never" to a relative time WITHOUT a page reload — the runs poll observes
    // the → ready transition and invalidates the last-elegibilidad query.
    await page.keyboard.press("Escape")
    await expect(modal).toBeHidden({ timeout: 5_000 })
    await expect(card.getByText("just now")).toBeVisible({ timeout: 15_000 })
    await expect(card.getByText("never")).toHaveCount(0)
  })

  test("results_ready card shows an actionable 'Revisar y aprobar' CTA, not clipped (JAA-360 / JAA-387)", async ({ page }) => {
    await navigateTo(page, "Elegibilidad", /elegibilidad/)

    // Argentina has no seeded run → execute it to reach results_ready, where
    // the action row holds Re-ejecutar + the "Revisar y aprobar" CTA.
    const card = page.locator('[data-slot="card"]').filter({ hasText: "Argentina" })
    await expect(card).toBeVisible({ timeout: 10_000 })
    await startRun(page, card)
    await expect(card.getByText(/Pendiente de revisión/i)).toBeVisible({ timeout: 30_000 })

    const ctaBtn = card.getByRole("button", { name: /Revisar y aprobar/i })
    await expect(ctaBtn).toBeVisible({ timeout: 10_000 })

    // The button must lie fully within the card's right edge — i.e. the action
    // row wrapped instead of overflowing/clipping it. (1px rounding tolerance.)
    const cardBox = await card.boundingBox()
    const btnBox = await ctaBtn.boundingBox()
    expect(cardBox).not.toBeNull()
    expect(btnBox).not.toBeNull()
    expect(btnBox!.x + btnBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1)
    expect(btnBox!.x).toBeGreaterThanOrEqual(cardBox!.x - 1)

    // It is hit-testable and opens the detail modal where the approve action lives.
    await ctaBtn.click()
    const modal = page.getByRole("dialog")
    await expect(modal).toBeVisible({ timeout: 5_000 })
    await expect(modal.getByRole("button", { name: /Aprobar y Aplicar/i })).toBeVisible({ timeout: 5_000 })
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

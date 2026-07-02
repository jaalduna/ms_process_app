import { test, expect } from "@playwright/test"
import type { Page, Locator } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * Calibración module E2E — exercises the deliberate per-country mock spread
 * (full / partial / no availability, seeded sync+calibration history) and the
 * deterministic trigger outcomes (DEMO_CALIBRATION_OUTCOMES in sync.js), and
 * guards the action-row layout: while a job runs, Play (Calibrar) is replaced
 * by Stop (JAA-778 — the two are mutually exclusive), and the row holds Stop +
 * Ver detalle, which must wrap instead of clipping the eye button against the
 * card border.
 */

/**
 * Confirm a radix AlertDialog action robustly (radix dialogs animate on open,
 * so a too-early action click — or the trigger click itself — is sometimes
 * swallowed). Mirrors the helper used in eligibility.spec.ts.
 */
async function confirmAction(page: Page, trigger: Locator, actionName: RegExp) {
  const dialog = page.getByRole("alertdialog")
  for (let attempt = 0; attempt < 4; attempt++) {
    if (!(await dialog.isVisible().catch(() => false))) {
      await trigger.click({ timeout: 8_000 }).catch(() => {})
      if (!(await dialog.isVisible({ timeout: 3_000 }).catch(() => false))) continue
    }
    await page.waitForTimeout(300) // let the open animation settle
    await dialog.getByRole("button", { name: actionName }).click({ timeout: 8_000 }).catch(() => {})
    if (await dialog.isHidden({ timeout: 5_000 }).catch(() => false)) return
  }
  throw new Error(`confirmAction(${actionName}) did not complete`)
}

/** The card for a given country (matched by its visible name). The card text
 *  glues the label to the next token (e.g. "MexicoCalibración…"), so match on a
 *  plain substring rather than a \b word-boundary regex. */
function countryCard(page: Page, name: string): Locator {
  return page.locator('[data-slot="card"]').filter({ hasText: name }).first()
}

test.describe("Calibración Module E2E", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
    await navigateTo(page, "Calibración", /calibration/)
    await expect(page.locator('[data-slot="card"]').first()).toBeVisible({ timeout: 10_000 })
  })

  test("renders 9 country cards with a varied availability spread", { tag: "@smoke" }, async ({ page }) => {
    const cards = page.locator('[data-slot="card"]')
    expect(await cards.count()).toBe(9)

    // JAA-570: availability is forced to UNKNOWN ("?") for every card until the
    // real elegibilidad/pesaje check is wired (the dev cloud env has no on-prem
    // SQL, so the backend returns meaningless `false`s). Unknown does NOT block
    // triggering — only an explicit `false` would — so Calibrar is enabled for
    // every country, regardless of the mock's seeded availability spread.
    await expect(countryCard(page, "Mexico").getByRole("button", { name: /^Calibrar$/ })).toBeEnabled()
    await expect(countryCard(page, "Ecuador").getByRole("button", { name: /^Calibrar$/ })).toBeEnabled()
  })

  // JAA-778: action buttons are icon-only — "Calibrar"/"Stop" are the
  // accessible name (aria-label/title), never visible text content.
  test("action buttons render no visible text ('Calibrar'/'Stop')", { tag: "@smoke" }, async ({ page }) => {
    const card = countryCard(page, "Mexico")
    await expect(card.getByRole("button", { name: /^Calibrar$/ })).toBeVisible()
    await expect(card.getByText("Calibrar", { exact: true })).toHaveCount(0)
    await expect(card.getByText("Stop", { exact: true })).toHaveCount(0)
  })

  // @flow (not @smoke): this triggers a run AND opens the detail modal — the
  // heaviest interaction here. Under full-suite load a cold vite route-compile can
  // reload the SPA (dropping the in-memory dev auth), which @smoke's retries:0
  // can't absorb; @flow's retries do. The pure layout/wrap assertion also lives
  // in vitest (WeightingCountryCard "action row wraps" + DependencyIndicator).
  test("running action row does not clip 'Ver detalle' (eye button)", async ({ page }) => {
    // Mexico: full availability + deterministic "pass" → a long-enough running
    // window to observe the three-control action row (Running + Stop + eye).
    const card = countryCard(page, "Mexico")
    const calibrar = card.getByRole("button", { name: /^Calibrar$/ })
    const eye = card.getByRole("button", { name: /view calibration details/i })
    const stop = card.getByRole("button", { name: /stop calibration/i })

    // Trigger the run. confirmAction can win the start but lose its own
    // dialog-hidden race and throw, so tolerate that — the real success signal
    // is the running-state controls (eye + stop) appearing below.
    await expect(calibrar).toBeEnabled()
    await confirmAction(page, calibrar, /^Confirm$/).catch(() => {})

    // Eye (Ver detalle) and Stop both appear once the job is running; Calibrar
    // (Play) is replaced by Stop in the same slot (JAA-778 — never both at once).
    await expect(eye).toBeVisible({ timeout: 15_000 })
    await expect(stop).toBeVisible({ timeout: 15_000 })
    await expect(calibrar).toBeHidden()

    // The eye button must lie fully within the card's right edge — i.e. the
    // action row wrapped instead of overflowing/clipping it. (1px tolerance.)
    const cardBox = await card.boundingBox()
    const eyeBox = await eye.boundingBox()
    expect(cardBox).not.toBeNull()
    expect(eyeBox).not.toBeNull()
    expect(eyeBox!.x + eyeBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1)
    expect(eyeBox!.x).toBeGreaterThanOrEqual(cardBox!.x - 1)

    // And it is hit-testable: a normal click (not dispatchEvent) opens the modal.
    await eye.click()
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 })
  })

  // JAA-763: Tarjetas/Lista toggle — the list view must carry the exact same
  // data/actions as the card grid (same row count, same Calibrar gating, same
  // history aria-label used by history-unify.spec.ts).
  test("Tarjetas/Lista toggle switches to a table with the same countries and working actions", { tag: "@smoke" }, async ({ page }) => {
    await page.getByRole("button", { name: "Lista" }).click()

    const table = page.getByRole("table")
    await expect(table).toBeVisible({ timeout: 10_000 })
    // Each row overrides its role to "button" (the whole row opens history, same as
    // the card), so count by that aria-label pattern rather than role="row".
    expect(await page.getByRole("button", { name: /view calibration history for/i }).count()).toBe(9)

    await expect(page.getByLabel(/view calibration history for mexico/i).getByRole("button", { name: /^Calibrar$/ })).toBeEnabled()

    // Whole-row click opens the same history modal as the card view.
    await page.getByLabel(/view calibration history for argentina/i).click()
    await expect(page.getByRole("dialog").filter({ hasText: "Historial de Calibracion" })).toBeVisible({ timeout: 10_000 })
    await page.keyboard.press("Escape")

    // Toggling back to Tarjetas restores the card grid without a reload.
    await page.getByRole("button", { name: "Tarjetas" }).click()
    await expect(page.locator('[data-slot="card"]').first()).toBeVisible({ timeout: 10_000 })
    await expect(table).toBeHidden()
  })
})

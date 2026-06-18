import { Page, Locator, expect } from "@playwright/test"

/**
 * Shared helpers for the Pesaje (weighting) e2e specs, post-JAA-425.
 *
 * JAA-425 collapsed the per-country card actions into a single entry point: the
 * whole card is a button that opens `WeightingDetailModal`, which now hosts the
 * editable params + the run button. The old card-level config / run / detail /
 * mark-as-ready buttons are gone; process close/open moved onto the status badge.
 */

/** A country card by its visible label. The card text glues the label to the
 *  next token (e.g. "Chilenever…"), so match on a plain substring. */
export function card(page: Page, label: string): Locator {
  return page.locator('[data-slot="card"]').filter({ hasText: label }).first()
}

/**
 * Open a country's detail/config modal by clicking the card. Targets the title
 * text so the click bubbles to the card's open handler without hitting the
 * nested status badge / Historial / Detener controls (which stop propagation).
 */
export async function openCardModal(page: Page, label: string): Promise<Locator> {
  await card(page, label).getByText(label, { exact: false }).first().click()
  const modal = page.getByRole("dialog")
  await expect(modal).toBeVisible({ timeout: 5_000 })
  return modal
}

/** The modal's run button ("Ejecutar" first time, "Re-ejecutar" after a run). */
export function runButton(modal: Locator): Locator {
  return modal.getByRole("button", { name: /^(Ejecutar|Re-ejecutar)$/ })
}

/**
 * Confirm a radix AlertDialog opened by `trigger` (e.g. the status-badge close/
 * open action). Clicks the trigger, waits for the alertdialog, clicks its action
 * button, and waits for it to close.
 */
export async function confirmDialog(page: Page, trigger: Locator, actionName: RegExp) {
  await trigger.click()
  const confirm = page.getByRole("alertdialog")
  await expect(confirm).toBeVisible()
  await confirm.getByRole("button", { name: actionName }).click()
  await expect(confirm).toBeHidden({ timeout: 8_000 })
}

/**
 * Trigger and confirm a run from the detail modal. The run button opens a confirm
 * AlertDialog whose action carries the same label ("Ejecutar"/"Re-ejecutar"); on
 * confirm the POST /weighting/runs fires and the modal closes. Pass the modal
 * locator so we can assert it dismissed.
 */
export async function confirmRun(page: Page, modal: Locator) {
  await runButton(modal).click()
  const confirm = page.getByRole("alertdialog")
  await expect(confirm).toBeVisible()
  await confirm.getByRole("button", { name: /^(Ejecutar|Re-ejecutar)$/ }).click()
  await expect(modal).not.toBeVisible({ timeout: 8_000 })
}

import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * JAA-989: scoped Playwright coverage for the QMS-TR page against
 * mock-server -- happy path (run to completion + download), failed-run
 * (error message / logs / retry), and the history view. Runs only this
 * file; the QMS-TR/MTR/Macrocac nav smoke lives in qmstr-macrocac.spec.ts
 * and the happy-path lifecycle already lives in qmstr-flow.spec.ts -- this
 * spec adds the error + history coverage the ticket calls out.
 */
test.describe("QMS-TR", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, { qmstr: true })
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
  })

  test("Brasil card loads, runs to completion with step progress, and downloads", { tag: "@smoke" }, async ({ page }) => {
    const nav = page.getByRole("navigation", { name: /main navigation/i })
    await nav.getByRole("link", { name: "QMS-TR", exact: true }).click()
    await expect(page).toHaveURL(/\/qms-tr$/, { timeout: 10_000 })

    const card = page.getByRole("button", { name: /Ver historial de QMS-TR para Brasil/ })
    await expect(card).toBeVisible({ timeout: 10_000 })

    await card.getByLabel("Año base").fill("2025")
    await card.getByRole("button", { name: "Ejecutar" }).click()

    const dialog = page.getByRole("alertdialog")
    await expect(dialog).toBeVisible()
    await dialog.getByRole("button", { name: "Confirmar" }).click()

    // Step progress comes from the API-driven pipeline, not a hardcoded DAG.
    await expect(card.getByText("Silver Builder")).toBeVisible({ timeout: 10_000 })
    await expect(card.getByText("Completado")).toBeVisible({ timeout: 30_000 })

    const downloadBtn = card.getByRole("button", { name: /Descargar resultado de QMS-TR para Brasil/ })
    await expect(downloadBtn).toBeVisible()

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadBtn.click(),
    ])
    expect(download.suggestedFilename()).toMatch(/^qms_tr_brasil_2025_.*\.zip$/)
  })

  test("failed run shows the error message, access to logs, and a retry button", async ({ page }) => {
    // Seed a deterministic failure directly against the mock: the UI's
    // Ejecutar dialog has no controls for force_outcome, so this bypasses
    // it (per team convention: only Playwright-level specs, still mock-only).
    await page.request.post(`${MOCK_API_BASE}/qms_tr/runs`, {
      data: { country: "chile", ano_base: 2024, force_outcome: "fail", fail_at_step: "silver_builder" },
    })

    const nav = page.getByRole("navigation", { name: /main navigation/i })
    await nav.getByRole("link", { name: "QMS-TR", exact: true }).click()
    await expect(page).toHaveURL(/\/qms-tr$/, { timeout: 10_000 })

    const card = page.getByRole("button", { name: /Ver historial de QMS-TR para Chile/ })
    await expect(card).toBeVisible({ timeout: 10_000 })

    await expect(card.getByText("Error", { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(card.getByText(/Pipeline failed at step: silver_builder/)).toBeVisible()

    const retryBtn = card.getByRole("button", { name: /Reintentar QMS-TR para Chile/ })
    await expect(retryBtn).toBeVisible()

    const logsBtn = card.getByRole("button", { name: /Ver logs completos de QMS-TR para Chile/ })
    await expect(logsBtn).toBeVisible()
    await logsBtn.click()

    const modal = page.getByRole("dialog")
    await expect(modal).toBeVisible()
    await expect(modal.getByText(/Pipeline failed at step: silver_builder/)).toBeVisible()
  })

  test("history view lists a previous run", async ({ page }) => {
    await page.request.post(`${MOCK_API_BASE}/qms_tr/runs`, {
      data: { country: "mexico", ano_base: 2023, force_outcome: "pass" },
    })

    const nav = page.getByRole("navigation", { name: /main navigation/i })
    await nav.getByRole("link", { name: "QMS-TR", exact: true }).click()
    await expect(page).toHaveURL(/\/qms-tr$/, { timeout: 10_000 })

    const card = page.getByRole("button", { name: /Ver historial de QMS-TR para Mexico/ })
    await expect(card).toBeVisible({ timeout: 10_000 })
    // Click the header status badge, not the card's bounding-box center: the
    // lower portion of the card (año base input, action buttons) stops
    // propagation so the run controls stay clickable without also opening
    // history, and the country name text is glued to the flag emoji (no
    // exact-text node to target).
    await expect(card.getByText("Completado")).toBeVisible({ timeout: 15_000 })
    await card.getByText("Completado").click()

    const historyModal = page.getByRole("dialog", { name: /QMS-TR History/ })
    await expect(historyModal).toBeVisible()
    // The mock pre-seeds history for every country, so scope to the entry
    // for the run this test just created rather than asserting on the
    // (non-unique) "Year:" label.
    await expect(historyModal.getByText("Year: 2023")).toBeVisible()
  })
})

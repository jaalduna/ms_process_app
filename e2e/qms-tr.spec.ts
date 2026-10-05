import { test, expect, type Page } from "@playwright/test"
import { login } from "./helpers/auth"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

/**
 * JAA-1401: QMS-TR contra mock-server (contrato de ms-process-api JAA-1400).
 * país + instante -> snapshot de J -> corrida (pasos del job qms_tr_run) -> descarga -> validación en J.
 * Solo este archivo (feedback: e2e acotado a la feature, nunca contra la API real).
 */
async function abrir(page: Page) {
  const nav = page.getByRole("navigation", { name: /main navigation/i })
  await nav.getByRole("link", { name: "QMS-TR", exact: true }).click()
  await expect(page).toHaveURL(/\/qms-tr$/, { timeout: 10_000 })
}

async function elegir(page: Page, pais: RegExp, instante: string) {
  await page.getByTestId("qmstr-country").click()
  await page.getByRole("option", { name: pais }).click()
  await page.getByTestId("qmstr-instante").fill(instante)
}

async function lanzar(page: Page) {
  await page.getByTestId("qmstr-launch").click()
  await page.getByTestId("qmstr-launch-confirm").click()
}

test.describe("QMS-TR", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, { qmstr: true })
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
  })

  test("elegir país e instante muestra el snapshot de J que se usará", { tag: "@smoke" }, async ({ page }) => {
    await abrir(page)
    await expect(page.getByRole("heading", { name: "QMS-TR", exact: true })).toBeVisible()
    await elegir(page, /Colombia/, "2026-09-11T08:00")
    await expect(page.getByTestId("qmstr-snapshot")).toContainText("Se usará el snapshot de J de las 08:08 del 11-09")
  })

  test("corrida completa: pasos del job, rama omitida, descarga y validación en J", async ({ page }) => {
    await abrir(page)
    await elegir(page, /Colombia/, "2026-09-11T08:00")
    await expect(page.getByTestId("qmstr-snapshot")).toBeVisible()
    await lanzar(page)

    const card = page.locator('[data-testid^="qmstr-run-"][data-status]').first()
    await expect(card.getByTestId("qmstr-steps")).toBeVisible({ timeout: 10_000 })
    const pasos = card.getByTestId("qmstr-steps").locator("[data-step]")
    await expect(pasos).toHaveCount(6)
    await expect(card).toHaveAttribute("data-status", "completed", { timeout: 60_000 })
    await expect(card.locator('[data-step="motor_grandes"]')).toHaveAttribute("data-status", "cancelled")
    await expect(card.getByText("(omitido)")).toBeVisible()

    const [download] = await Promise.all([page.waitForEvent("download"), card.getByTestId("qmstr-download").click()])
    expect(download.suggestedFilename()).toMatch(/^qms_tr_colombia_colombia_\d{6}_[0-9a-f]+\.zip$/)

    await card.getByTestId("qmstr-validate").click()
    const val = card.getByTestId("qmstr-validacion")
    await expect(val).toContainText("Aplicación parcial", { timeout: 10_000 })
    await expect(val.getByTestId("qmstr-validacion-factores")).toContainText("255")
  })

  test("instante sin snapshot todavía: la corrida espera y parte sola", async ({ page }) => {
    await abrir(page)
    const manana = new Date(Date.now() + 24 * 3_600_000)
    const z = (n: number) => String(n).padStart(2, "0")
    await elegir(page, /Brasil/, `${manana.getFullYear()}-${z(manana.getMonth() + 1)}-${z(manana.getDate())}T10:30`)
    await expect(page.getByTestId("qmstr-snapshot-waiting")).toBeVisible({ timeout: 10_000 })
    await lanzar(page)

    const card = page.locator('[data-testid^="qmstr-run-"][data-status]').first()
    await expect(card.getByTestId("qmstr-run-status")).toHaveText("Esperando snapshot", { timeout: 10_000 })
    await expect(card).toHaveAttribute("data-status", /running|completed/, { timeout: 60_000 })
  })

  test("una corrida fallida muestra el error", async ({ page }) => {
    await page.request.post(`${MOCK_API_BASE}/qms_tr/runs`, {
      data: { country: "chile", at: "2026-09-11T11:00:00Z", mes_procesamiento: "202608", force_outcome: "fail", fail_at_step: "prep" },
    })
    await abrir(page)
    const card = page.locator('[data-testid^="qmstr-run-"][data-status]').first()
    await expect(card).toHaveAttribute("data-status", "failed", { timeout: 60_000 })
    await expect(card.getByRole("alert")).toContainText("Falló el paso prep")
  })
})

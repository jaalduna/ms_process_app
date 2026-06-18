import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"
import { card, openCardModal, runButton } from "./helpers/weighting"

// JAA-343 — the Pesaje config form exposes the param_configs.py weighting params
// and propagates them as `parameters` on run create -> parameters_json.
// JAA-425: params are edited inside the card's detail/config modal (controls are
// labelled by raw key) and applied when the run is confirmed.
const EXPECTED_KEYS = [
  "N_PERIODOS_OUTLIERS",
  "MAX_ROUNDS_COLAPSO",
  "JERARQUIA_MIN_COLAPSO",
  "CORRECAO_BOUNDS",
  "METODO_BOUNDS",
  "P_BOUNDS",
  "F_BOUNDS",
  "AGREGACAO_BOUNDS",
  "MAX_ERR_RATIO_BOUNDS",
]

test.describe("Weighting params (JAA-343)", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
  })

  test("edited params are sent as parameters_json on run create", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Pesaje", /pesaje/)

    // JAA-425: open Chile's detail/config modal — params + run button live here.
    const chile = card(page, "Chile")
    await expect(chile).toBeVisible({ timeout: 15_000 })
    const modal = await openCardModal(page, "Chile")

    // Change an enum param: METODO_BOUNDS -> IQR (value "iqr").
    await modal.getByRole("combobox", { name: "METODO_BOUNDS" }).click()
    await page.getByRole("option", { name: "IQR" }).click()

    // Change a number param: MAX_ROUNDS_COLAPSO -> 80.
    await modal.getByLabel("MAX_ROUNDS_COLAPSO").fill("80")

    // Toggle a bool param off: CORRECAO_BOUNDS (default true).
    await modal.getByRole("switch", { name: "CORRECAO_BOUNDS" }).click()

    // The run button ("Ejecutar" for a fresh period, "Re-ejecutar" after a run)
    // opens a confirm AlertDialog whose action carries the same label; the POST
    // /weighting/runs fires on confirm and the modal closes.
    await runButton(modal).click()
    const confirm = page.getByRole("alertdialog")
    await expect(confirm).toBeVisible()
    const [request] = await Promise.all([
      page.waitForRequest(
        (req) => req.method() === "POST" && /\/weighting\/runs(\?|$)/.test(req.url()),
      ),
      confirm.getByRole("button", { name: /^(Ejecutar|Re-ejecutar)$/ }).click(),
    ])

    // Acceptance: the create body carries the edited params...
    const body = request.postDataJSON() as { country?: string; parameters?: Record<string, unknown> }
    expect(body.country).toBe("chile")
    expect(body.parameters).toBeTruthy()
    const params = body.parameters as Record<string, unknown>
    for (const key of EXPECTED_KEYS) {
      expect(params, `missing ${key}`).toHaveProperty(key)
    }
    expect(params.METODO_BOUNDS).toBe("iqr")
    expect(params.MAX_ROUNDS_COLAPSO).toBe(80)
    expect(params.CORRECAO_BOUNDS).toBe(false)

    // ...and the mock round-trips them into the created run's parameters_json.
    const response = await request.response()
    expect(response?.status()).toBe(201)
    const created = (await response?.json()) as { parameters_json?: Record<string, unknown> }
    expect(created.parameters_json).toMatchObject({
      METODO_BOUNDS: "iqr",
      MAX_ROUNDS_COLAPSO: 80,
      CORRECAO_BOUNDS: false,
    })
    for (const key of EXPECTED_KEYS) {
      expect(created.parameters_json, `parameters_json missing ${key}`).toHaveProperty(key)
    }
  })
})

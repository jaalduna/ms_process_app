import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

// JAA-343 — the Pesaje config form exposes the param_configs.py weighting params
// and propagates them as `parameters` on run create -> parameters_json.
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

    // Params are per-country now (JAA-423): open Chile's own config dialog.
    const chile = page.locator('[data-slot="card"]').filter({ hasText: "Chile" }).first()
    await chile.getByRole("button", { name: "Configurar parametros" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()

    // Change an enum param: METODO_BOUNDS -> IQR.
    await dialog.getByRole("combobox", { name: "Metodo de limites" }).click()
    await page.getByRole("option", { name: "IQR" }).click()

    // Change a number param: MAX_ROUNDS_COLAPSO -> 80.
    const maxRounds = dialog.getByLabel("Maximo juntas marginales")
    await maxRounds.fill("80")

    // Toggle a bool param off: CORRECAO_BOUNDS.
    await dialog.getByRole("switch", { name: "Correccion de limites" }).click()

    // Close the dialog.
    await page.keyboard.press("Escape")
    await expect(dialog).not.toBeVisible()

    // Trigger Chile's run: "Ejecutar" opens a confirm AlertDialog; the
    // POST /weighting/runs only fires after clicking "Confirmar".
    await chile.getByRole("button", { name: /^(re-?ejecutar|ejecutar)$/i }).click()

    const [request] = await Promise.all([
      page.waitForRequest(
        (req) => req.method() === "POST" && /\/weighting\/runs(\?|$)/.test(req.url()),
      ),
      page.getByRole("button", { name: "Confirmar" }).click(),
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

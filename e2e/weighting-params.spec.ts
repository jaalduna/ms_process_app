import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"
import { card, openCardModal, runButton } from "./helpers/weighting"

// JAA-343 / JAA-425 — the card's detail/config modal exposes the launch-tunable
// weighting params and propagates them as `parameters` on run create ->
// parameters_json. Reclassified (2026-07): only the 4 "De ejecución" params are
// editable at launch; the rest of the F-001 set is edited + persisted in the
// Parametros tab (published via the weighting-params API) and seeds the modal.
const EXECUTION_KEYS = ["MAX_ROUNDS_COLAPSO", "CORRECAO_BOUNDS", "P_BOUNDS", "F_BOUNDS"]
const STATIC_KEYS = ["N_PERIODOS_OUTLIERS", "JERARQUIA_MIN_COLAPSO", "METODO_BOUNDS", "AGREGACAO_BOUNDS", "MAX_ERR_RATIO_BOUNDS"]

test.describe("Weighting params (JAA-343)", () => {
  test.beforeEach(async ({ page }) => {
    await setModuleConfig(page, {})
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
  })

  test("published execution params are sent as parameters_json on run create", { tag: "@smoke" }, async ({ page }) => {
    await navigateTo(page, "Pesaje", /pesaje/)

    // JAA-425: open Chile's detail/config modal — params + run button live here.
    const chile = card(page, "Chile")
    await expect(chile).toBeVisible({ timeout: 15_000 })
    const modal = await openCardModal(page, "Chile")

    // Only the 4 "De ejecución" params are shown here (read-only — editing
    // happens exclusively in the Parametros tab); the static/advanced ones
    // (METODO_BOUNDS, N_PERIODOS_OUTLIERS, …) don't appear at all.
    await expect(modal.getByText("MAX_ROUNDS_COLAPSO")).toBeVisible()
    await expect(modal.getByText("50", { exact: true })).toBeVisible()
    for (const key of [...EXECUTION_KEYS, ...STATIC_KEYS]) {
      await expect(modal.getByLabel(key)).toHaveCount(0)
    }
    for (const key of STATIC_KEYS) {
      await expect(modal.getByText(key)).toHaveCount(0)
    }

    // The run button opens a confirm AlertDialog; the POST /weighting/runs
    // fires on confirm and the modal closes.
    await runButton(modal).click()
    const confirm = page.getByRole("alertdialog")
    await expect(confirm).toBeVisible()
    const [request] = await Promise.all([
      page.waitForRequest(
        (req) => req.method() === "POST" && /\/weighting\/runs(\?|$)/.test(req.url()),
      ),
      confirm.getByRole("button", { name: /^(Ejecutar|Re-ejecutar)$/ }).click(),
    ])

    // Acceptance: the create body carries exactly the execution params, at
    // their currently-published (F-001 default, nothing published yet) values.
    const body = request.postDataJSON() as { country?: string; parameters?: Record<string, unknown> }
    expect(body.country).toBe("chile")
    expect(body.parameters).toBeTruthy()
    const params = body.parameters as Record<string, unknown>
    expect(Object.keys(params).sort()).toEqual([...EXECUTION_KEYS].sort())
    expect(params.MAX_ROUNDS_COLAPSO).toBe(50)
    expect(params.CORRECAO_BOUNDS).toBe(true)

    // ...and the mock round-trips them into the created run's parameters_json.
    const response = await request.response()
    expect(response?.status()).toBe(201)
    const created = (await response?.json()) as { parameters_json?: Record<string, unknown> }
    expect(created.parameters_json).toMatchObject({ MAX_ROUNDS_COLAPSO: 50, CORRECAO_BOUNDS: true })
  })

  test("published execution defaults persist and seed the launch modal", async ({ page }) => {
    await navigateTo(page, "Pesaje", /pesaje/)

    // Parametros tab: edit MAX_ROUNDS_COLAPSO for Chile (default país CL) and publish.
    await page.getByRole("tab", { name: "Parametros" }).click()
    const maxRounds = page.getByLabel("MAX_ROUNDS_COLAPSO")
    await expect(maxRounds).toHaveValue("50")
    await maxRounds.fill("99")
    await page.getByTestId("exec-params-review").click()
    const publishBtn = page.getByTestId("confirm-publish")
    await expect(publishBtn).toBeEnabled()
    const [publishReq] = await Promise.all([
      page.waitForRequest((req) => req.method() === "POST" && /weighting\/params\/CL\/idpeso-config\/publish/.test(req.url())),
      publishBtn.click(),
    ])
    const publishBody = publishReq.postDataJSON() as { params?: Record<string, unknown> }
    expect(publishBody.params?.MAX_ROUNDS_COLAPSO).toBe(99)

    // The published value survives a fresh session (persisted server-side).
    // A reload drops the DevAuthProvider session, so log in again.
    await login(page)
    await navigateTo(page, "Pesaje", /pesaje/)
    await page.getByRole("tab", { name: "Parametros" }).click()
    await expect(page.getByLabel("MAX_ROUNDS_COLAPSO")).toHaveValue("99")
    await expect(page.getByTestId("exec-params-version")).toHaveText(/v1/)

    // …and seeds the launch modal for Chile (read-only display, not an input —
    // editing is exclusive to the Parametros tab).
    await page.getByRole("tab", { name: "Ejecutar" }).click()
    const modal = await openCardModal(page, "Chile")
    await expect(modal.getByLabel("MAX_ROUNDS_COLAPSO")).toHaveCount(0)
    await expect(modal.getByText("MAX_ROUNDS_COLAPSO")).toBeVisible()
    await expect(modal.getByText("99", { exact: true })).toBeVisible()
  })
})

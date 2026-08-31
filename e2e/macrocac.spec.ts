import path from "path"
import { fileURLToPath } from "url"
import { test, expect } from "@playwright/test"
import { login } from "./helpers/auth"
import { navigateTo } from "./helpers/navigation"
import { setModuleConfig, MOCK_API_BASE } from "./helpers/config"

// PythonCac: subir el Excel de correcciones → revisar el formato detectado →
// confirmar en el diálogo → aplicar → descargar el reporte. Se ejercita contra
// el contrato del mock (`mock-server/routes/macrocac.js`).
//
// NO existe "Ejecutar (dry-run)": el motor abre transacción, aplica y hace
// COMMIT. La compuerta es el diálogo de confirmación, por eso todos los flujos
// que escriben pasan por `macrocac-confirm-aceptar`.
//
// El módulo se llama "PythonCac" en la UI; el `id`, la ruta `/macrocac` y los
// `data-testid` siguen diciendo `macrocac` — son el contrato con el backend.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(__dirname, "fixtures", "correcciones_bo.xlsx")

test.describe("PythonCac Module E2E", () => {
  test.beforeEach(async ({ page }) => {
    // macrocac is off in setModuleConfig's defaults — opt in explicitly.
    await setModuleConfig(page, { macrocac: true })
    await page.request.post(`${MOCK_API_BASE}/test/reset`)
    await login(page)
    await navigateTo(page, "PythonCac", /macrocac/)
  })

  /** El input queda deshabilitado hasta que llega la lista de tablas: sin destino no hay adónde subir. */
  async function subirFixture(page: import("@playwright/test").Page) {
    const input = page.getByTestId("macrocac-file-input")
    await expect(input).toBeEnabled({ timeout: 10_000 })
    await input.setInputFiles(FIXTURE)
  }

  test("subir un xlsx válido muestra el chip, y confirmar aplica los cambios", { tag: "@smoke" }, async ({ page }) => {
    await expect(page.getByTestId("macrocac-aplicar")).toBeDisabled()

    await subirFixture(page)

    const chip = page.getByTestId("macrocac-upload-chip")
    await expect(chip).toBeVisible({ timeout: 10_000 })
    await expect(chip).toContainText("correcciones_bo.xlsx")
    await expect(chip).toContainText("14 filas")

    const aplicar = page.getByTestId("macrocac-aplicar")
    await expect(aplicar).toBeEnabled()
    await aplicar.click()

    // Nada se ejecuta hasta confirmar: el diálogo resume qué se va a escribir.
    const dialog = page.getByTestId("macrocac-confirm-dialog")
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog).toContainText("14")
    await expect(page.getByTestId("macrocac-run-status")).toHaveCount(0)

    await page.getByTestId("macrocac-confirm-aceptar").click()

    await expect(page.getByTestId("macrocac-run-status")).toBeVisible({ timeout: 10_000 })
    // El mock avanza el run solo; el estado final ofrece el reporte. Se afirma
    // sobre eso y no sobre el texto "aplicando cambios", que dura milisegundos
    // con MOCK_STEP_INTERVAL_MS bajo y haría el test intermitente.
    await expect(page.getByTestId("macrocac-descargar-reporte")).toBeVisible({ timeout: 15_000 })
    await expect(dialog).toHaveCount(0)
  })

  test("cancelar la confirmación no aplica nada", { tag: "@smoke" }, async ({ page }) => {
    await subirFixture(page)
    await expect(page.getByTestId("macrocac-upload-chip")).toBeVisible({ timeout: 10_000 })

    await page.getByTestId("macrocac-aplicar").click()
    await expect(page.getByTestId("macrocac-confirm-dialog")).toBeVisible({ timeout: 10_000 })
    await page.getByTestId("macrocac-confirm-cancelar").click()

    await expect(page.getByTestId("macrocac-confirm-dialog")).toHaveCount(0)
    await expect(page.getByTestId("macrocac-run-status")).toHaveCount(0)
    // El archivo sigue cargado: cancelar no obliga a volver a subirlo.
    await expect(page.getByTestId("macrocac-upload-chip")).toBeVisible()
  })

  test("un archivo sin las columnas obligatorias muestra el error de columnas", { tag: "@smoke" }, async ({ page }) => {
    const input = page.getByTestId("macrocac-file-input")
    await expect(input).toBeEnabled({ timeout: 10_000 })
    await input.setInputFiles({
      name: "correcciones-sin-idato.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("mock xlsx"),
    })

    const missing = page.getByTestId("macrocac-missing-columns")
    await expect(missing).toBeVisible({ timeout: 10_000 })
    await expect(missing).toContainText("IdAto")
    await expect(missing).toContainText("Flg")
    await expect(page.getByTestId("macrocac-aplicar")).toBeDisabled()
    await expect(page.getByTestId("macrocac-upload-chip")).toHaveCount(0)
  })

  test("aplicar un segundo lote para el mismo país/tabla mientras corre uno muestra el conflicto", async ({ page }) => {
    await subirFixture(page)
    await expect(page.getByTestId("macrocac-upload-chip")).toBeVisible({ timeout: 10_000 })
    await page.getByTestId("macrocac-aplicar").click()
    await page.getByTestId("macrocac-confirm-aceptar").click()
    await expect(page.getByTestId("macrocac-run-status")).toBeVisible({ timeout: 10_000 })

    // Quitar + volver a subir el mismo país/tabla da un upload_id nuevo; aplicarlo
    // mientras el primer run sigue activo pega contra la regla de dedupe del mock
    // por (pais, tabla) → 409 run_in_progress.
    await page.getByTestId("macrocac-upload-remove").click()
    await subirFixture(page)
    await expect(page.getByTestId("macrocac-upload-chip")).toBeVisible({ timeout: 10_000 })
    await page.getByTestId("macrocac-aplicar").click()
    await page.getByTestId("macrocac-confirm-aceptar").click()

    const conflict = page.getByTestId("macrocac-run-conflict")
    await expect(conflict).toBeVisible({ timeout: 10_000 })
    await expect(conflict).toContainText("run_macrocac_")
  })
})

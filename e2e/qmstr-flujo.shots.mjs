// Screenshots de la vista Flujo QMS-TR (JAA-1435), claro y oscuro. Uso:
//   PORT=8000 npm run mock:fast & npm run dev:e2e &
//   node e2e/qmstr-flujo.shots.mjs [directorio]   (default docs/qmstr_flujo)
import { chromium } from "@playwright/test"
import path from "path"

const OUT = process.argv[2] ?? "docs/qmstr_flujo"
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://[::1]:5173/ms-process-app/"
const API = "http://127.0.0.1:8000/api/v1"

async function pagina(browser, theme, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: theme })
  const page = await ctx.newPage()
  await page.addInitScript((t) => localStorage.setItem("theme", t), theme)
  await page.route("**/config.js", (r) => r.fulfill({
    contentType: "application/javascript",
    body: `window.__BRIDGE_CONFIG__ = { API_URL: "${API}" };\nwindow.__APP_CONFIG__ = { modules: { overview: true, qmstr: true } };`,
  }))
  await page.goto(BASE)
  await page.getByRole("button", { name: /continue \(dev\)/i }).click()
  // la sesión dev vive en memoria: se navega por el menú, no con goto
  await page.getByRole("navigation", { name: /main navigation/i }).getByRole("link", { name: "Flujo QMS-TR" }).click()
  await page.getByTestId("qf-tablero").waitFor()
  await page.getByTestId("qf-progreso").waitFor()
  await page.waitForTimeout(600)
  return { ctx, page }
}

const browser = await chromium.launch({ args: ["--no-proxy-server"] })
await fetch(`${API}/test/reset`, { method: "POST" })
for (const theme of ["light", "dark"]) {
  const { ctx, page } = await pagina(browser, theme, { width: 1440, height: 900 })
  await page.screenshot({ path: path.join(OUT, `flujo_${theme}.png`), fullPage: true })
  await page.getByTestId("qf-lanzar").click()
  await page.getByTestId("qf-override-liberadas").click()
  await page.getByTestId("qf-override-buscar").fill("")
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(OUT, `override_${theme}.png`) })
  await page.keyboard.press("Escape")
  await page.getByTestId("qf-tab-correos").click()
  await page.getByTestId("qf-bandeja").waitFor()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(OUT, `correos_${theme}.png`), fullPage: true })
  await ctx.close()
}
const { ctx, page } = await pagina(browser, "light", { width: 390, height: 844 })
// el shell de la app no colapsa solo el menú en pantallas chicas: se colapsa a mano
await page.getByRole("button", { name: "Colapsar menú" }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: path.join(OUT, "flujo_movil_light.png"), fullPage: true })
await ctx.close()
await browser.close()
console.log("screenshots en", OUT)

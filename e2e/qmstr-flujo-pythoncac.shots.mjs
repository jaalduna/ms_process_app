// Capturas del flujo QMS-TR con entrega directa en J (pythoncac), para el PDF de respuestas
// (mtr docs/flujo/respuestas_flujo_qmstr_v1.0.tex). Uso:
//   en ms-process-api: scripts/qmstr_flujo_fake_api_pythoncac.py 8012, con la tanda de 6 bases
//   lanzada y cerrada como dice su docstring
//   aquí: VITE_AUTH_BYPASS=true npx vite --port 5181
//   PLAYWRIGHT_BASE_URL=http://localhost:5181/ms-process-app/ node e2e/qmstr-flujo-pythoncac.shots.mjs <dir> [01..05]
// Deja en <dir> las capturas y cajas.json: tamaño de cada una y posición (px CSS) de lo que el
// PDF numera, para las llamadas \shot del .tex.
import { chromium } from "@playwright/test"
import fs from "fs"
import path from "path"

const OUT = process.argv[2] ?? "docs/qmstr_flujo"
const SOLO = process.argv[3] // una captura (p. ej. "01") o todas
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5181/ms-process-app/"
const API = process.env.API ?? "http://127.0.0.1:8012/api/v1"
const cajas = {}

async function abrir(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "light" })
  const page = await ctx.newPage()
  await page.addInitScript(() => localStorage.setItem("theme", "light"))
  await page.route("**/config.js", (r) => r.fulfill({
    contentType: "application/javascript",
    body: `window.__BRIDGE_CONFIG__ = { API_URL: "${API}" };\nwindow.__APP_CONFIG__ = { modules: { overview: true, qmstr: true } };`,
  }))
  await page.goto(BASE)
  await page.getByRole("button", { name: /continue \(dev\)/i }).click()
  await page.getByRole("navigation", { name: /main navigation/i }).getByRole("link", { name: "Flujo QMS-TR" }).click()
  await page.getByTestId("qf-tablero").waitFor()
  await page.waitForTimeout(800)
  return { ctx, page }
}

/** Captura del elemento y, relativas a él (px CSS), las cajas de los elementos numerados. */
async function foto(page, nombre, el, marcas, hasta) {
  await el.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  const b = await el.boundingBox()
  // `hasta`: elemento donde se corta la captura (lo de más abajo no se muestra)
  if (hasta) b.height = (await hasta.boundingBox()).y - b.y - 4
  await page.screenshot({ path: path.join(OUT, nombre), clip: b })
  const m = {}
  for (const [n, loc] of Object.entries(marcas)) {
    const c = await loc.first().boundingBox()
    m[n] = c ? { x: Math.round(c.x - b.x), y: Math.round(c.y - b.y), w: Math.round(c.width), h: Math.round(c.height) } : null
  }
  cajas[nombre] = { w: Math.round(b.width), h: Math.round(b.height), marcas: m }
}

const browser = await chromium.launch({ args: ["--no-proxy-server"] })
const { ctx, page } = await abrir(browser)
const quiero = (k) => !SOLO || SOLO === k

if (SOLO === "00") await page.screenshot({ path: path.join(OUT, "00_pagina.png"), fullPage: true })

if (quiero("01")) {
  const t = page.getByTestId("qf-tablero")
  await foto(page, "01_tablero.png", t, {
    1: page.getByTestId("qf-paises"),
    2: t.locator('[data-testid^="qf-kpi-"]'),
    3: page.getByTestId("qf-celdas"),
  })
}

if (quiero("02")) {
  await page.getByTestId("qf-lanzar").click()
  const dlg = page.getByTestId("qf-override")
  await dlg.waitFor()
  await page.waitForTimeout(400)
  for (const p of [41, 45]) await page.getByTestId(`qf-override-base-${p}`).click()
  await page.waitForTimeout(300)
  await foto(page, "02_lanzar.png", dlg, {
    1: page.getByTestId("qf-override-pais"),
    2: page.getByTestId("qf-override-bases"),
    3: page.getByTestId("qf-override-revisar"),
  })
  await page.keyboard.press("Escape")
  await page.waitForTimeout(400)
}

if (quiero("03")) {
  const card = page.getByTestId("qf-tanda-1")
  await card.getByText(/^6 bases$/).click()
  await page.waitForTimeout(400)
  await foto(page, "03_cerrada.png", card, {
    1: card.getByTestId("qf-tanda-estado"),
    2: card.getByTestId("qf-stepper"),
    3: card.getByTestId("qf-accion-reporte"),
  })
}

if (quiero("04")) {
  await page.getByTestId("qf-celda-8").click()
  const det = page.getByTestId("qf-detalle")
  await det.waitFor()
  await page.waitForTimeout(500)
  await foto(page, "04_detalle_base.png", det, {
    1: det.getByText(/Sin ajustes/).first(),
    2: page.getByTestId("qf-detalle-motivos"),
  }, page.getByTestId("qf-detalle-lanzar"))
  await page.keyboard.press("Escape")
  await page.waitForTimeout(400)
}

if (quiero("05")) {
  await page.getByTestId("qf-tanda-1").getByTestId("qf-accion-revertir").click()
  const dlg = page.getByTestId("qf-revertir")
  await dlg.waitFor()
  await page.waitForTimeout(400)
  for (const p of [15, 28]) await page.getByTestId(`qf-revertir-base-${p}`).click()
  await page.getByTestId("qf-revertir-motivo").fill("Se recalibraron por redistribución de actos")
  await page.getByTestId("qf-revertir-revisar").click()
  await page.getByTestId("qf-revertir-pisar").waitFor({ timeout: 15_000 })
  await page.waitForTimeout(400)
  await foto(page, "05_revertir.png", dlg, {
    1: dlg.getByText(/Vas a revertir/),
    2: page.getByTestId("qf-revertir-pisar"),
  })
}

fs.writeFileSync(path.join(OUT, "cajas.json"), JSON.stringify(cajas, null, 2))
await ctx.close()
await browser.close()
console.log(JSON.stringify(cajas, null, 2))

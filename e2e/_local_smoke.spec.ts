import { test, expect } from "@playwright/test"

test("dashboard loads against remote bridge", async ({ page }) => {
  const apiCalls: { url: string; status: number }[] = []
  page.on("response", (resp) => {
    const u = resp.url()
    if (u.includes("/api/v1/")) apiCalls.push({ url: u, status: resp.status() })
  })
  const failedReqs: { url: string; err: string }[] = []
  page.on("requestfailed", (req) => {
    failedReqs.push({ url: req.url(), err: req.failure()?.errorText ?? "?" })
  })
  const consoleMessages: string[] = []
  page.on("console", (msg) => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`)
  })

  await page.goto("/", { waitUntil: "networkidle" })
  await page.getByRole("button", { name: /sign in/i }).click()
  await page.waitForURL(/\/(dashboard|overview|sync|elegibilidad)/, { timeout: 10_000 })

  // Wait for ALL six stage queries to fire (covers the 404s too — they still
  // count as responses and unblock TanStack Query's loading state).
  await Promise.all(
    [
      "metadata/countries",
      "metadata/last-sync",
      "metadata/last-calibration",
      "metadata/last-elegibilidad",
      "metadata/last-prices",
      "metadata/last-weighting",
      "metadata/last-mtr",
    ].map((p) =>
      page.waitForResponse((r) => r.url().includes(p), { timeout: 30_000 }).catch(() => null),
    ),
  )
  await page.waitForTimeout(3_000)
  await page.screenshot({ path: "smoke-2-dashboard.png", fullPage: true })

  // Dump rendered rows count
  const rowCount = await page.locator("tbody tr").count()
  console.log(`overview tbody rows: ${rowCount}`)
  console.log(`final URL: ${page.url()}`)
  console.log("=== API CALLS ===")
  for (const c of apiCalls) console.log(`  ${c.status}  ${c.url}`)
  console.log("=== FAILED REQUESTS ===")
  for (const f of failedReqs.slice(-20)) console.log(`  ${f.err}  ${f.url}`)
  console.log("=== CONSOLE ===")
  for (const e of consoleMessages.slice(-10)) console.log(`  ${e}`)

  // Navigate to a module that actually shows running jobs — try Calibración
  // (its sidebar link exists per the previous screenshot).
  const calibracionLink = page.getByRole("link", { name: /calibraci/i })
  if (await calibracionLink.count()) {
    await calibracionLink.first().click()
    await page.waitForTimeout(3_000)
    await page.screenshot({ path: "smoke-3-calibracion.png", fullPage: true })
  }

  expect.soft(apiCalls.length, "expected at least one /api/v1 call").toBeGreaterThan(0)
})

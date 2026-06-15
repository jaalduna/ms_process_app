import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  timeout: 300_000, // 5 min per test (syncs are slow)
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // The mock-server is a shared, stateful singleton and beforeEach hooks call
  // POST /test/reset. Multiple workers would run spec FILES in parallel and reset
  // each other's state mid-test, so e2e must run single-worker.
  workers: 1,
  // The dev server lazy-compiles routes on first navigation, so the first cold
  // interaction can be slow/flaky; retry to absorb that environmental noise.
  retries: 2,
  reporter: "list",
  use: {
    // Per-worktree port isolation: override with PLAYWRIGHT_BASE_URL when the
    // default 5173 is taken by another worktree's dev server.
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://[::1]:5173/ms-process-app/",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    // Windows corporate machines often have slow proxy auto-detection (WPAD)
    // and IPv6/IPv4 Happy Eyeballs negotiation. These flags bypass both issues
    // so Chromium connects directly without delays.
    launchOptions: {
      args: [
        "--no-proxy-server",
        "--host-resolver-rules=MAP localhost 127.0.0.1",
      ],
    },
  },
  webServer: undefined, // we start servers manually
})

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
  // Default for the full/@flow run; the fast @smoke project overrides to 0 below.
  retries: 2,
  reporter: "list",
  // JAA-393: two projects split by tag. The @smoke set (page loads, nav, badge
  // render, button enable/disable, form validation, dialog-open, in-progress-only
  // assertions) needs NO pipeline completion, so it runs fast with retries:0 —
  // ideal for pre-push (npm run test:e2e:fast). Everything else (@flow: full
  // trigger->run->ready->approve lifecycles, cancel, failure, downloads,
  // parallel-country) keeps retries:2 and runs in CI/pre-merge. Run both via
  // `npm run test:e2e:full` (no --project). Pair either with `npm run mock:fast`
  // to shrink the wall-clock-bound pipeline waits (MOCK_STEP_INTERVAL_MS).
  projects: [
    { name: "smoke", grep: /@smoke/, retries: 0 },
    { name: "flow", grepInvert: /@smoke/ },
  ],
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

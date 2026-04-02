# Spec: E2E Tests for New Modules

**Slug**: `e2e-tests`
**PRD**: `PRD-ms-process-app`
**PRD Features**: F-09
**Status**: implementing
**Priority**: Should-have
**Phase**: Phase 4 — Cross-cutting
**Depends on**: SPEC-prices-module, SPEC-weighting-module, SPEC-mtr-module, SPEC-traceability, SPEC-pipeline-deps, SPEC-module-registry, SPEC-mock-server
**Created**: 2026-04-02

---

## Problem

The existing Playwright E2E test suite (`e2e/`) covers Sync module flows (login, dashboard, history, country-specific sync, performance). New modules (Prices, Weighting, MTR, Traceability) and cross-cutting features (pipeline dependency awareness) will lack automated E2E coverage, increasing the risk of regressions during development and future maintenance.

## Scope

### In Scope
- New Playwright test files for each new module (Prices, Weighting, MTR, Traceability)
- Navigation and module toggle tests
- Pipeline dependency indicator tests
- Shared test helpers (login, navigation, period selection)
- Mock server test fixture configuration
- CI integration (if CI pipeline exists)

### Out of Scope
- Unit tests for individual components (covered within each module spec)
- Visual regression tests (e.g., Percy, Chromatic)
- Performance/load tests beyond basic page load timing
- Tests against the real backend (all tests use mock server)

## Requirements

### Functional Requirements

#### Prices Module Tests

1. **FR-01**: A test must verify that the Prices module page loads and displays a country-card grid with 9 country cards when navigated to `/precios`.
   - *Rationale*: Confirms the module renders its primary layout correctly.
2. **FR-02**: A test must verify that triggering a price validation for a country creates a run and displays step-based progress indicators.
   - *Rationale*: Validates the core trigger-and-monitor flow.
3. **FR-03**: A test must verify that outlier results are displayed in a data table after a validation run completes, showing at minimum `product`, `declared_price`, `deviation_pct`, and `reason` columns.
   - *Rationale*: Ensures the results view renders correctly with the expected data columns from the mock.
4. **FR-04**: A test must verify that the approval action updates the run status to "approved".
   - *Rationale*: Confirms the approval workflow functions end-to-end.
5. **FR-05**: A test must verify that cancelling a running validation stops it and shows "cancelled" status.
   - *Rationale*: Validates the cancel flow.
6. **FR-06**: A test must verify that a failed validation displays an error message and a retry action.
   - *Rationale*: Confirms error recovery UX.

#### Weighting Module Tests

7. **FR-07**: A test must verify that the Weighting module page loads and displays a country-card grid when navigated to `/pesaje`.
   - *Rationale*: Confirms basic module rendering.
8. **FR-08**: A test must verify that the configuration dialog opens, accepts parameter changes (as defined by SPEC-weighting-module), and those parameters are included in the POST body when triggering a run.
   - *Rationale*: Validates the config-then-trigger flow. Specific parameters depend on SPEC-weighting-module's design.
9. **FR-09**: A test must verify that a completed weighting run displays summary statistics (min, max, mean, median weight).
   - *Rationale*: Confirms results rendering.
10. **FR-10**: A test must verify that cancelling a running weighting shows "cancelled" status.
    - *Rationale*: Validates cancel flow.

#### MTR Module Tests

11. **FR-11**: A test must verify that the MTR module page loads and displays a country-card grid when navigated to `/mtr`.
    - *Rationale*: Confirms basic module rendering.
12. **FR-12**: A test must verify that triggering MTR creates a run and displays step-based progress.
    - *Rationale*: Validates core trigger-and-monitor flow.
13. **FR-13**: A test must verify that a completed MTR run displays imputation results summary.
    - *Rationale*: Confirms results rendering.
14. **FR-14**: A test must verify that a failed MTR run displays error details and retry action.
    - *Rationale*: Confirms error recovery UX.

#### Traceability Module Tests

15. **FR-15**: A test must verify that the Traceability module page loads and displays a filterable tag list when navigated to `/trazabilidad`.
    - *Rationale*: Confirms basic module rendering.
16. **FR-16**: A test must verify that applying filters (country, period, stage) updates the tag list results.
    - *Rationale*: Validates filter interaction.
17. **FR-17**: A test must verify that clicking a tag row opens a detail modal showing run metadata and a table list.
    - *Rationale*: Confirms detail view rendering.
18. **FR-18**: A test must verify that the CSV download action on a tagged table initiates a file download.
    - *Rationale*: Validates the download flow.
19. **FR-19**: A test must verify that pagination works when there are more tags than fit on one page. The mock seeds 25 tags; the frontend's page size determines when pagination activates. If the frontend page size is >25, the test should use a smaller page size or seed additional tags via the test setup.
    - *Rationale*: Confirms pagination UX.

#### Pipeline Dependency Tests

20. **FR-20**: A test must verify that dependency status indicators (green check, grey neutral, red failed) render on country cards in pipeline modules.
    - *Rationale*: Confirms cross-cutting dependency UI.
21. **FR-21**: A test must verify that triggering with unmet dependencies shows a warning but still allows the user to proceed.
    - *Rationale*: Validates the soft-gate UX.

#### Navigation Tests

22. **FR-22**: A test must verify that all module nav items (Sync, Precios, Elegibilidad, Pesaje, Calibracion, MTR, Trazabilidad) are visible when all modules are enabled in config.
    - *Rationale*: Confirms dynamic navigation rendering. The complete list includes all 7 modules from `useModuleConfig`.
23. **FR-23**: A test must verify that disabling a module in `config.js` hides its nav item and returns 404 or redirect when navigating to its route directly.
    - *Rationale*: Validates module toggle behavior.
24. **FR-24**: A test must verify that the default route redirects to the first enabled module when navigating to an unknown path.
    - *Rationale*: Confirms fallback routing.

#### Infrastructure

25. **FR-25**: All E2E tests must run against the mock server without any real backend dependency.
    - *Rationale*: Tests must be deterministic and runnable in CI without external services.

#### History Tests

26. **FR-26**: A test must verify that clicking a history action on a Prices country card opens a modal showing past runs with period, status, and date columns.
    - *Rationale*: Confirms the run history view is accessible and renders seeded data.

#### Mock Server Determinism

27. **FR-27**: The mock server must support a deterministic execution mode (e.g., `POST /test/reset` disabling random step failures, or a `?deterministic=true` query param on `/execute`) so that happy-path tests never fail due to the 5% random failure in `RunStore._advanceStep()`.
    - *Rationale*: Without this, any test that triggers a run has a compounding chance of random failure per step, violating NFR-04 (no flaky tests).

28. **FR-28**: The mock server must support forcing a run to fail at a specific step (e.g., `POST /test/fail-run/:runId` or a `?force_fail_at_step=<step_name>` query param on `/execute`) so that error-path tests (FR-06, FR-14) can deterministically produce a failed run without relying on random chance.
    - *Rationale*: FR-06 and FR-14 require a failed run state. Without a forced-failure mechanism, these tests cannot reliably create the precondition they need to test.

### Non-Functional Requirements

1. **NFR-01**: The full new-module E2E test suite must complete in under 5 minutes on a standard development machine.
   - *Rationale*: Fast feedback loop for developers.
2. **NFR-02**: Test files must be independent and parallelizable — no test in one file may depend on state from another file.
   - *Rationale*: Enables `fullyParallel: true` for new tests.
3. **NFR-03**: Tests must follow the existing Playwright conventions established in `e2e/smoke.spec.ts`: `test.describe` blocks, `@playwright/test` imports, role-based selectors, `getByText`/`getByRole` queries, `timeout` annotations.
   - *Rationale*: Consistent test codebase.
4. **NFR-04**: Tests must not depend on specific timing — use Playwright's built-in waiting (`toBeVisible`, `waitForSelector`) rather than `setTimeout`.
   - *Rationale*: Prevents flaky tests.

## Data Flow

```
Playwright Test Runner
        |
        | HTTP (baseURL: http://[::1]:5173/ms-process-app/)
        v
Vite Dev Server (VITE_AUTH_BYPASS=true)
        |
        | Axios HTTP calls
        v
Mock Server (Express, http://127.0.0.1:5000/api/v1)
        |
        | In-memory fixtures
        v
Predefined test data (9 countries, mock runs, mock tags)
```

> **Note**: The mock server Express app binds to port **5000** (`mock-server/server.js`). The frontend's `public/config.js` sets `API_URL` to `http://127.0.0.1:8000/api/v1`. For E2E tests to work, either `config.js` must be updated to port 5000, or a proxy/port mapping must align the two. Verify this before writing tests.

- **Auth**: Bypassed via `VITE_AUTH_BYPASS=true` and `DevAuthProvider`. Tests click "Sign In" which auto-authenticates.
- **API**: All API calls from the app hit the mock server. The mock server simulates pipeline step progression over time.
- **State**: Mock server uses in-memory state. Each test starts with a clean state via `POST /api/v1/test/reset`.

## Technical Design

### Test Infrastructure

#### Authentication Helper

All existing tests repeat the login sequence. Extract a shared helper:

```typescript
// e2e/helpers/auth.ts
import { Page, expect } from "@playwright/test"

export async function login(page: Page) {
  await page.goto("/")
  await expect(page.getByText("SQL-Databricks Bridge")).toBeVisible({ timeout: 10_000 })
  await page.getByRole("button", { name: /sign in/i }).click()
}
```

#### Navigation Helper

```typescript
// e2e/helpers/navigation.ts
import { Page, expect } from "@playwright/test"

export async function navigateTo(page: Page, moduleName: string, expectedUrl: RegExp) {
  const link = page.getByRole("link", { name: new RegExp(moduleName, "i") })
  await expect(link).toBeVisible()
  await link.click()
  await expect(page).toHaveURL(expectedUrl, { timeout: 10_000 })
}
```

#### Module Config Override

For navigation tests that need to toggle modules on/off (FR-23, FR-24), use Playwright's `page.route()` to intercept and replace `config.js` with a custom response. This is more reliable than `addInitScript()` because `public/config.js` is loaded as a `<script>` tag in `index.html` and would overwrite any earlier `window.__APP_CONFIG__` set by init scripts.

```typescript
// e2e/helpers/config.ts
import { Page } from "@playwright/test"

export async function setModuleConfig(page: Page, modules: Partial<Record<string, boolean>>) {
  const allModules = {
    sync: true, calibration: true, elegibilidad: true,
    prices: true, weighting: true, mtr: true, traceability: true,
    ...modules,
  }
  await page.route("**/config.js", (route) => {
    route.fulfill({
      contentType: "application/javascript",
      body: `
        window.__BRIDGE_CONFIG__ = { API_URL: "http://127.0.0.1:5000/api/v1" };
        window.__APP_CONFIG__ = { modules: ${JSON.stringify(allModules)} };
      `,
    })
  })
}
```

This must be called **before** `page.goto()` so the route interception is active when the page loads.

#### Mock Server State Reset

The `POST /test/reset` endpoint already exists in `mock-server/routes/test.js`. Call it in `test.beforeEach` to ensure deterministic state:

```typescript
test.beforeEach(async ({ page }) => {
  // Port must match the running mock server (currently 5000 in server.js)
  await page.request.post("http://127.0.0.1:5000/api/v1/test/reset")
})
```

#### Playwright Config

No changes needed to `playwright.config.ts` — existing config supports the new test files. Tests inherit `testDir: "./e2e"`, `baseURL`, and `headless: true`.

### Affected Components

- `e2e/` — all new test files
- `mock-server/routes/test.js` — extend `POST /test/reset` to also set deterministic mode (disable random step failures per FR-27); add `POST /test/fail-run/:runId` to force a run into failed state (FR-28)
- `mock-server/stores/run-store.js` — add deterministic mode flag to skip the 5% random failure in `_advanceStep()`; add `forceFailAtStep()` method for controlled failure injection

### New Components

| File | Purpose |
|------|---------|
| `e2e/helpers/auth.ts` | Shared login helper |
| `e2e/helpers/navigation.ts` | Shared navigation helper |
| `e2e/helpers/config.ts` | Shared module config override helper for toggle tests |
| `e2e/prices.spec.ts` | Prices module E2E tests (FR-01 through FR-06, FR-26) |
| `e2e/weighting.spec.ts` | Weighting module E2E tests (FR-07 through FR-10) |
| `e2e/mtr.spec.ts` | MTR module E2E tests (FR-11 through FR-14) |
| `e2e/traceability.spec.ts` | Traceability module E2E tests (FR-15 through FR-19) |
| `e2e/pipeline-deps.spec.ts` | Pipeline dependency indicator E2E tests (FR-20, FR-21) |
| `e2e/navigation.spec.ts` | Navigation and module toggle E2E tests (FR-22 through FR-24) |

## Test Plan

### Prices Module (`e2e/prices.spec.ts`)

| Test Name | Preconditions | Steps | Expected Result |
|-----------|--------------|-------|-----------------|
| page loads with country cards | Logged in, mock server running | Navigate to `/precios` | 9 country cards visible, period selector visible |
| trigger validation shows progress | Logged in, on Prices page | Select country, select period, click trigger | Run created, step progress indicators appear, status shows "running" |
| completed run shows outlier results | Mock: run completes after polling | Trigger and wait for completion | Outlier data table visible with product/price/reason columns |
| approve cleans data | Mock: run in `results_ready` state | Click approve button | Status changes to "approved", success toast shown |
| cancel stops running validation | Mock: run in `running` state | Click cancel button, confirm | Status changes to "cancelled" |
| failed run shows error and retry | Mock: run fails after trigger | Trigger, wait for failure | Error message visible, retry button visible |
| history modal shows past runs | Mock: 3 past runs exist | Click history button on country card | Modal with 3 rows, each showing period/status/date |

### Weighting Module (`e2e/weighting.spec.ts`)

| Test Name | Preconditions | Steps | Expected Result |
|-----------|--------------|-------|-----------------|
| page loads with country cards | Logged in, mock server running | Navigate to `/pesaje` | 9 country cards visible |
| config dialog sets parameters | Logged in, on Pesaje page | Open config, change a parameter, save | Dialog closes, parameter persisted for next trigger |
| trigger shows progress | Config set, country selected | Click trigger | Run created, step indicators visible |
| completed run shows weight stats | Mock: run completes | Trigger and wait | Summary stats visible (min, max, mean, median) |
| cancel stops pipeline | Mock: run is running | Click cancel | Status shows "cancelled" |

### MTR Module (`e2e/mtr.spec.ts`)

| Test Name | Preconditions | Steps | Expected Result |
|-----------|--------------|-------|-----------------|
| page loads with country cards | Logged in, mock server running | Navigate to `/mtr` | 9 country cards visible |
| trigger shows progress | On MTR page, country selected | Click trigger | Run created, step indicators visible |
| completed run shows imputation results | Mock: run completes | Trigger and wait | Imputation summary visible (targets, imputations count) |
| failed run shows error and retry | Mock: run fails | Trigger, wait | Error message visible, retry button visible |

### Traceability Module (`e2e/traceability.spec.ts`)

| Test Name | Preconditions | Steps | Expected Result |
|-----------|--------------|-------|-----------------|
| page loads with tag list | Logged in, mock server with 20 tags | Navigate to `/trazabilidad` | Tag table visible, rows rendered |
| filter by country | Tag list visible | Select "Chile" in country filter | Only Chile tags shown |
| filter by stage | Tag list visible | Select "Calibracion" in stage filter | Only Calibracion tags shown |
| combined filters | Tag list visible | Select Chile + Calibracion | Intersection of both filters |
| pagination works | Mock seeds 25 tags; frontend page size or `?limit` param makes 25 exceed one page | Navigate to page 2 | Different tags shown, page indicator updates |
| tag detail opens | Tag list visible | Click a tag row | Modal opens with run metadata and table list |
| CSV download initiates | Tag detail modal open | Click download on a table | Download starts (verify response header or download event) |

### Pipeline Dependencies (`e2e/pipeline-deps.spec.ts`)

| Test Name | Preconditions | Steps | Expected Result |
|-----------|--------------|-------|-----------------|
| dependency indicators render | Logged in, mock: upstream completed | Navigate to a pipeline module | Green check indicators visible on country cards |
| unmet deps show warning | Mock: upstream not completed | Click trigger on a country card | Warning message about unmet dependencies shown |
| can trigger despite warning | Warning shown | Click "proceed anyway" | Run is created despite unmet dependencies |

### Navigation (`e2e/navigation.spec.ts`)

| Test Name | Preconditions | Steps | Expected Result |
|-----------|--------------|-------|-----------------|
| all modules in nav | All modules enabled via `setModuleConfig` | Login and check nav | All 7 module names visible in navigation (Sync, Precios, Elegibilidad, Pesaje, Calibracion, MTR, Trazabilidad) |
| disabled module hidden | `prices: false` in config | Login and check nav | "Precios" not in navigation |
| disabled route redirects | `prices: false` in config | Navigate directly to `/precios` | Redirected to default route |
| default route redirect | Logged in | Navigate to `/nonexistent` | Redirected to first enabled module |

## Edge Cases & Constraints

1. **Empty country list**: If the mock server returns 0 countries, the module page should show an empty state message — not crash. Test: mock `/metadata/countries` to return `{ countries: [] }`.
2. **No runs for a country**: Country card should show "No previous runs" or equivalent, not a loading spinner forever. Test: mock returns empty run list for a specific country.
3. **In-flight run on page load**: If a run is already `running` when the page loads, the country card should pick it up and show progress immediately. Test: mock returns a `running` run on first poll.
4. **Mock server slow response**: Tests must use Playwright's built-in waiting mechanisms, not hardcoded timeouts. If the mock server takes 2+ seconds to respond, tests should still pass.
5. **Navigation during run**: If the user navigates away from a module while a run is in progress, navigating back should resume showing the run's current status.
6. **Period selector boundary**: Test with the most recent period and the oldest available period to ensure the selector works at boundaries.
7. **Download in headless mode**: Playwright in headless mode handles downloads differently. Use `page.waitForEvent('download')` to verify CSV downloads without actually writing files.
8. **Concurrent run attempt**: If a user tries to trigger a second run for the same country while one is already running, the mock server returns HTTP 409 Conflict. The UI should handle this gracefully (e.g., disable the trigger button while a run is active, or show an error message). Consider adding a test for this if the UI provides explicit handling.

## Assumptions

- The mock server (`mock-server/server.js`) will have been extended with all new module endpoints (per SPEC-mock-server) before E2E tests are written.
- `VITE_AUTH_BYPASS=true` is set when running E2E tests (same as existing tests).
- The mock server's `POST /test/reset` endpoint already exists (in `mock-server/routes/test.js`) and resets all stores. It will be extended to also disable random step failures (FR-27).
- Module toggle behavior works at the `config.js` level. Tests override `window.__APP_CONFIG__` via `page.route()` interception of `config.js` before navigation (see `e2e/helpers/config.ts`).
- The mock server's `COUNTRIES` array contains exactly 9 entries (`argentina, bolivia, brasil, cam, chile, colombia, ecuador, mexico, peru`), which matches FR-01/FR-07/FR-11's "9 country cards" assertion.
- The mock server port (currently 5000 in `server.js`) must match the `API_URL` in `config.js` (currently 8000). This mismatch must be resolved before tests run -- either update `config.js` or add a port remap.

## Acceptance Criteria

1. [ ] **AC-01**: `e2e/prices.spec.ts` exists and contains at least 5 tests covering happy-path (trigger, progress, results, approve) and error-path (failed run with retry).
2. [ ] **AC-02**: `e2e/weighting.spec.ts` exists and contains at least 4 tests covering config, trigger, results, and cancel flows.
3. [ ] **AC-03**: `e2e/mtr.spec.ts` exists and contains at least 3 tests covering trigger, results, and error-path flows.
4. [ ] **AC-04**: `e2e/traceability.spec.ts` exists and contains at least 5 tests covering tag list, filters, pagination, detail view, and CSV download.
5. [ ] **AC-05**: `e2e/pipeline-deps.spec.ts` exists and contains at least 2 tests covering dependency indicator rendering and soft-gate warning.
6. [ ] **AC-06**: `e2e/navigation.spec.ts` exists and contains at least 3 tests covering module visibility when enabled/disabled and default route redirect.
7. [ ] **AC-07**: Shared helpers exist in `e2e/helpers/` (at minimum `auth.ts` with login helper).
8. [ ] **AC-08**: All new test files pass when run with `npx playwright test` with both the Vite dev server (`VITE_AUTH_BYPASS=true`) and mock server running. The playwright config's `webServer` may optionally be updated to auto-start both servers.
9. [ ] **AC-09**: New test files are independent — running any single file in isolation passes without depending on other test files.
10. [ ] **AC-10**: Total execution time for all new test files is under 5 minutes when run in parallel.
11. [ ] **AC-11**: All tests use Playwright's built-in waiting (`toBeVisible`, `waitForSelector`, `waitForEvent`) — no `setTimeout` or `page.waitForTimeout` calls.
12. [ ] **AC-12**: The mock server's `POST /test/reset` endpoint (or an alternative mechanism) disables random step failures so that E2E happy-path tests are deterministic.
13. [ ] **AC-13**: `e2e/helpers/config.ts` exists with a `setModuleConfig()` helper that uses `page.route()` to intercept `config.js` and override `window.__APP_CONFIG__` for navigation toggle tests.
14. [ ] **AC-14**: The mock server exposes a mechanism to force a run to fail at a specific step (for FR-06/FR-14 error-path tests), separate from the deterministic mode that prevents random failures.

## Dependencies

- **SPEC-prices-module**: Prices module must be implemented for `e2e/prices.spec.ts`
- **SPEC-weighting-module**: Weighting module must be implemented for `e2e/weighting.spec.ts`
- **SPEC-mtr-module**: MTR module must be implemented for `e2e/mtr.spec.ts`
- **SPEC-traceability**: Traceability module must be implemented for `e2e/traceability.spec.ts`
- **SPEC-pipeline-deps**: Pipeline dependency feature must be implemented for `e2e/pipeline-deps.spec.ts`
- **SPEC-module-registry**: Navigation refactor must be done for `e2e/navigation.spec.ts`
- **SPEC-mock-server**: Mock server must have all new module endpoints

## Estimated Effort

- **T-shirt size**: M
- **Suggested breakdown**: 6 tasks (one per test file) + 1 task for shared helpers/infrastructure + 1 task for mock server deterministic mode = 8 tasks across 1 phase

## Linear Issues

| Issue | Title | Requirements | Depends on | Status |
|-------|-------|-------------|------------|--------|
| JAA-229 | Mock server deterministic mode and forced failure endpoints | FR-27, FR-28 | (none) | Backlog |
| JAA-232 | Shared E2E test helpers (auth, navigation, config) | FR-25, AC-07, AC-13 | JAA-229 | Backlog |
| JAA-236 | E2E tests: Prices module (prices.spec.ts) | FR-01–FR-06, FR-26 | JAA-229, JAA-232 | Backlog |
| JAA-238 | E2E tests: Weighting module (weighting.spec.ts) | FR-07–FR-10 | JAA-229, JAA-232 | Backlog |
| JAA-242 | E2E tests: MTR module (mtr.spec.ts) | FR-11–FR-14 | JAA-229, JAA-232 | Backlog |
| JAA-244 | E2E tests: Traceability module (traceability.spec.ts) | FR-15–FR-19 | JAA-229, JAA-232 | Backlog |
| JAA-247 | E2E tests: Pipeline dependency indicators (pipeline-deps.spec.ts) | FR-20, FR-21 | JAA-229, JAA-232 | Backlog |
| JAA-251 | E2E tests: Navigation and module toggle (navigation.spec.ts) | FR-22–FR-24 | JAA-229, JAA-232 | Backlog |

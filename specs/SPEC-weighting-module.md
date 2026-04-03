# Spec: Weighting Module

**Slug**: `weighting-module`
**PRD**: `PRD-ms-process-app`
**PRD Features**: F-02
**Status**: implementing
**Priority**: Must-have
**Phase**: Phase 2 — Core Modules
**Depends on**: SPEC-module-registry, SPEC-mock-server
**Created**: 2026-04-02

---

## Problem

Once households are determined to be eligible, a weight (expansion factor) must be assigned to each household so that the sample represents the universe. This weighting process is currently performed manually by the Weighting Specialist using Databricks notebooks. There is no front-end interface to configure parameters, trigger the pipeline, or review weight distributions before they flow into calibration.

## Scope

### In Scope
- `src/modules/pesaje/` directory with pages, components, hooks, types
- Module registration via `ModuleDefinition` in `src/modules/registry.ts`
- Country card grid page with period selector
- Weighting parameter configuration dialog
- Pipeline trigger and real-time progress polling
- Weight distribution results view (summary statistics)
- Weighting history modal
- CSV download of weighting results
- API client functions added to `src/lib/api.ts`
- Type definitions added to `src/types/api.ts` for `LastWeightingEntry`/`LastWeightingResponse`
- Mock server CSV download endpoint for weighting

### Out of Scope
- Backend pipeline implementation (Databricks notebooks)
- Weight calculation algorithm
- Data availability checks for eligibility completion (deferred to SPEC-pipeline-deps)
- Histogram/chart visualization of weight distributions (summary table only; chart can be added later)

## Requirements

### Functional

1. **FR-01**: Display a country-card grid showing all 9 LATAM countries with their last weighting date and current period.
   - *Rationale*: Gives the Weighting Specialist an at-a-glance view of which countries need attention.

2. **FR-02**: Allow the Weighting Specialist to select a country and period (YYYYMM) and configure weighting parameters before triggering.
   - *Rationale*: Different countries may require different parameters; the specialist must confirm settings before execution.

3. **FR-03**: Trigger the weighting pipeline for the selected country and period.
   - *Rationale*: Replaces manual Databricks notebook execution with a one-click trigger from the UI.

4. **FR-04**: Show real-time step-based progress of the weighting pipeline.
   - *Rationale*: Pipeline runs take minutes; the specialist needs to see which step is executing and estimate completion.

5. **FR-05**: Display weight distribution results — summary statistics (min, max, mean, median, std dev, total households, weighted households) and per-stratum breakdowns — in a results view.
   - *Rationale*: The specialist must validate that weight distributions are reasonable before results flow to calibration.

6. **FR-06**: Support cancellation of a running weighting pipeline.
   - *Rationale*: If incorrect parameters were used, the specialist needs to stop and re-trigger without waiting for completion.

7. **FR-07**: Show weighting history per country with status, period, and completion dates.
   - *Rationale*: Provides auditability and allows the specialist to compare results across periods.

8. **FR-08**: Allow downloading weighting results as CSV.
   - *Rationale*: Enables offline review and sharing with stakeholders who don't have app access.

9. **FR-09**: Show error details and support retry when a weighting run fails.
   - *Rationale*: Pipeline failures are common; clear error messages and one-click retry reduce resolution time.

### Non-Functional

1. **NFR-01**: Pipeline progress polling: runs list polls at 3000ms when any run is active (matching calibracion pattern); individual run detail polls at 2000ms when run is active (matching elegibilidad pattern). Polling stops when no active runs exist.
   - *Rationale*: Balances responsiveness with API load, consistent with existing module polling intervals.

2. **NFR-02**: Follow established country-card grid pattern used by elegibilidad and calibracion modules.
   - *Rationale*: Consistent UX across pipeline modules.

3. **NFR-03**: Register via `ModuleDefinition` plugin system in `src/modules/registry.ts`.
   - *Rationale*: Standard module registration pattern; enables feature-flag gating via `useModuleConfig`.

## User Stories Covered

- **US-03**: Configure weighting parameters and trigger weight calculation
- **US-04**: Review weight distributions and summary statistics
- **US-10**: Real-time progress feedback
- **US-11**: Error details and retry

## Data Flow

```
[PesajePage] → PeriodSelector → [WeightingCountryCard per country]
                                       │
                              ┌────────┴────────┐
                              │  User clicks     │
                              │  "Ejecutar"      │
                              └────────┬────────┘
                                       │
                    POST /weighting/runs (create run)
                    POST /weighting/runs/:id/execute (trigger)
                                       │
                              ┌────────┴────────┐
                              │  Poll GET        │
                              │  /weighting/runs │
                              │  every 3s        │
                              └────────┬────────┘
                                       │
                    Steps: load_eligible → calculate_weights →
                           validate_distributions → export_results → complete
                                       │
                              ┌────────┴────────┐
                              │  Completed:      │
                              │  Show summary    │
                              │  stats + CSV     │
                              └─────────────────┘
```

## Technical Design

### Module Definition

```typescript
// src/modules/pesaje/index.ts
import { lazy } from "react"
import type { ModuleDefinition } from "../types"

export const pesajeModule: ModuleDefinition = {
  id: "weighting",
  label: "Pesaje",
  group: "pipeline",
  navItems: [{ path: "/pesaje", label: "Pesaje" }],
  routes: [{ path: "/pesaje", component: lazy(() => import("./pages/PesajePage").then(m => ({ default: m.PesajePage }))) }],
}
```

### Module Gating

The module is gated by `useModuleConfig()` from `src/hooks/useModuleConfig.ts`, which already contains `weighting: config?.weighting ?? false`. The navigation and route rendering in `AuthenticatedLayout` uses this config to conditionally show/hide the module. No changes needed to the gating mechanism.

### Key Components

| Component | Description |
|-----------|-------------|
| `PesajePage` | Main page: period selector + country card grid (follows `ElegibilidadPage` pattern) |
| `WeightingCountryCard` | Per-country card with status, trigger, progress (follows `EligibilityCountryCard` pattern) |
| `WeightingConfigDialog` | Parameter configuration dialog (follows `EligibilityConfigDialog` pattern) |
| `WeightingDetailModal` | Run detail with weight distribution results (follows `EligibilityDetailModal` pattern) |
| `WeightingProgress` | Step-based pipeline visualization (follows `EligibilityProgress` pattern) |
| `WeightingHistoryModal` | Past runs list with CSV download |

### Types

```typescript
// src/modules/pesaje/types.ts

export type WeightingStepName =
  | "load_eligible"
  | "calculate_weights"
  | "validate_distributions"
  | "export_results"
  | "complete"

export type WeightingStatus = "pending" | "running" | "completed" | "failed" | "cancelled"

export interface WeightingStep {
  name: WeightingStepName
  label: string
  status: string
  started_at?: string
  completed_at?: string
  error?: string | null
}

export interface WeightingSummary {
  total_households: number
  weighted_households: number
  min_weight: number
  max_weight: number
  mean_weight: number
  median_weight: number
  std_dev: number
}

export interface WeightingRun {
  run_id: string
  country: string
  period: number
  status: WeightingStatus
  parameters_json?: Record<string, unknown>
  summary_stats?: WeightingSummary | null
  steps?: WeightingStep[]
  current_step?: string | null
  started_at?: string
  completed_at?: string
  created_by?: string
  created_at: string
  updated_at: string
  error_message?: string | null
}

export interface WeightingRunCreate {
  country: string
  period: number
  parameters?: Record<string, unknown>
}

export const WEIGHTING_STEP_ORDER: WeightingStepName[] = [
  "load_eligible",
  "calculate_weights",
  "validate_distributions",
  "export_results",
  "complete",
]

export const WEIGHTING_STEP_LABELS: Record<WeightingStepName, string> = {
  load_eligible: "Cargar Elegibles",
  calculate_weights: "Calcular Pesos",
  validate_distributions: "Validar Distribuciones",
  export_results: "Exportar Resultados",
  complete: "Listo",
}

export const WEIGHTING_ACTIVE_STATUSES: WeightingStatus[] = ["running"]

export const WEIGHTING_STATUS_CONFIG: Record<
  WeightingStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }
> = {
  pending: { label: "Pendiente", variant: "outline", className: "" },
  running: { label: "Ejecutando...", variant: "default", className: "bg-blue-500 hover:bg-blue-500/80" },
  completed: { label: "Completado", variant: "default", className: "bg-green-600 hover:bg-green-600/80" },
  failed: { label: "Error", variant: "destructive", className: "" },
  cancelled: { label: "Cancelado", variant: "secondary", className: "" },
}
```

### Weighting Parameters (Config Dialog)

The `WeightingConfigDialog` follows the `EligibilityConfigDialog` pattern: a typed params interface, default values, and metadata with labels/units for each parameter. Since the exact backend parameters are not yet defined (Open Question #2), the initial implementation uses placeholder parameters that match common weighting algorithm inputs:

```typescript
// src/modules/pesaje/components/WeightingConfigDialog.tsx

export interface WeightingParams {
  max_weight: number          // Maximum allowed expansion factor
  min_weight: number          // Minimum allowed expansion factor
  cv_threshold: number        // Coefficient of variation threshold for convergence
  max_iterations: number      // Maximum number of calibration iterations
  trim_percentile: number     // Percentile at which to trim outlier weights
}

export const DEFAULT_WEIGHTING_PARAMS: WeightingParams = {
  max_weight: 500,
  min_weight: 10,
  cv_threshold: 0.05,
  max_iterations: 50,
  trim_percentile: 0.99,
}

const PARAM_META: Record<keyof WeightingParams, { label: string; unit: string; step?: string }> = {
  max_weight: { label: "Peso máximo permitido", unit: "factor" },
  min_weight: { label: "Peso mínimo permitido", unit: "factor" },
  cv_threshold: { label: "Umbral CV para convergencia", unit: "ratio", step: "0.01" },
  max_iterations: { label: "Iteraciones máximas", unit: "iter" },
  trim_percentile: { label: "Percentil de recorte outliers", unit: "%", step: "0.01" },
}
```

### Hooks

The following hooks are exported from `src/modules/pesaje/hooks/useWeighting.ts`, mirroring the pattern in `src/modules/elegibilidad/hooks/useEligibility.ts`:

```typescript
// src/modules/pesaje/hooks/useWeighting.ts

/** List runs for a country/period. Polls at 3000ms when any run has active status. */
export function useWeightingRuns(country?: string, period?: number): UseQueryResult<WeightingRun[]>

/** Single run detail. Polls at 2000ms when run status is active. */
export function useWeightingRun(runId: string | null): UseQueryResult<WeightingRun | undefined>

/** Create a new weighting run. Invalidates runs list on success. */
export function useCreateWeightingRun(): UseMutationResult<WeightingRun, unknown, WeightingRunCreate>

/** Trigger execution of a pending run. Invalidates runs list + run detail on success. */
export function useExecuteWeighting(): UseMutationResult<WeightingRun, unknown, string>

/** Cancel a running or pending run. Invalidates runs list + run detail on success. */
export function useCancelWeighting(): UseMutationResult<WeightingRun, unknown, string>
```

From `src/modules/pesaje/hooks/useLastWeighting.ts`:

```typescript
// src/modules/pesaje/hooks/useLastWeighting.ts

/** Fetches last completed weighting per country from GET /metadata/last-weighting. */
export function useLastWeighting(): UseQueryResult<Record<string, LastWeightingEntry>>
```

### API Functions

The following functions must be added to `src/lib/api.ts`:

```typescript
// -- Weighting --

export function getWeightingRuns(params?: { country?: string; period?: number; status?: string; limit?: number; offset?: number }) {
  return api.get<{ items: WeightingRun[]; total: number }>("/weighting/runs", { params }).then(r => r.data.items)
}

export function getWeightingRun(runId: string) {
  return api.get<WeightingRun>(`/weighting/runs/${runId}`).then(r => r.data)
}

export function createWeightingRun(data: WeightingRunCreate) {
  return api.post<WeightingRun>("/weighting/runs", data).then(r => r.data)
}

export function executeWeighting(runId: string) {
  return api.post<WeightingRun>(`/weighting/runs/${runId}/execute`).then(r => r.data)
}

export function cancelWeighting(runId: string) {
  return api.post<WeightingRun>(`/weighting/runs/${runId}/cancel`).then(r => r.data)
}

export function getLastWeighting() {
  return api.get<LastWeightingResponse>("/metadata/last-weighting").then(r => r.data)
}

export async function downloadWeightingCSV(runId: string): Promise<void> {
  const response = await api.get(`/weighting/runs/${runId}/download`, { responseType: "blob" })
  const url = URL.createObjectURL(new Blob([response.data]))
  const a = document.createElement("a")
  a.href = url
  const disposition = response.headers["content-disposition"] ?? ""
  const match = disposition.match(/filename="?([^";\n]+)"?/)
  a.download = match?.[1] ?? `weighting_${runId.slice(0, 8)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
```

Types to add to `src/types/api.ts`:

```typescript
export interface LastWeightingEntry {
  country: string
  completed_at: string
  run_id: string
  period: number
}

export interface LastWeightingResponse {
  countries: Record<string, LastWeightingEntry>
}
```

### Component Layout: WeightingDetailModal

The `WeightingDetailModal` follows the `EligibilityDetailModal` layout pattern, adapted for weighting-specific data. Sections (top to bottom):

1. **Header**: Dialog title "Detalle Pesaje" + status badge
2. **Metadata grid** (2-col): Country, Period, Start time, Duration
3. **Parameters** (separator): Read-only display of `parameters_json` key-value pairs. When run is `failed`, parameters are editable for re-run (same as eligibilidad `results_ready` pattern).
4. **Pipeline steps** (separator): `WeightingProgress` bar + expandable step rows showing step name, status badge, duration, start/end times.
5. **Summary statistics** (separator, only when `completed`): Formatted table showing total_households, weighted_households, min_weight, max_weight, mean_weight, median_weight, std_dev from `summary_stats`.
6. **Error** (separator, only when `error_message` present): Red-background error message display.
7. **Action buttons** (DialogFooter):
   - "Re-ejecutar" (when failed, with optional param edits) -- creates new run
   - "Descargar CSV" (when completed) -- triggers `downloadWeightingCSV`
   - "Procesando..." spinner (when running)
   - "Cancelar" destructive button (when running/pending) -- with confirmation dialog

### Component Layout: WeightingHistoryModal

The `WeightingHistoryModal` is triggered from a "Historial" button on each country card (visible when at least one non-pending run exists). It shows:

1. **Dialog title**: "Historial de Pesaje - {CountryLabel}"
2. **Runs table**: Rows sorted by `created_at` descending, showing:
   - Period (YYYYMM)
   - Status badge (using `WEIGHTING_STATUS_CONFIG`)
   - Start date
   - Duration
   - Summary: "N hogares, peso medio X.XX" (from `summary_stats` if available)
3. **Per-row actions**:
   - "Descargar CSV" button (only for `completed` runs)
   - "Ver detalle" button (opens `WeightingDetailModal` for that run)

The modal receives `countryCode` and `period` props and uses `useWeightingRuns(countryCode)` to fetch all runs (not filtered by period, showing full history).

### Affected Components (Files to Modify)
- `src/modules/registry.ts`: Add `pesajeModule` to the `allModules` array
- `src/lib/api.ts`: Add weighting API functions (see API Functions section)
- `src/types/api.ts`: Add `LastWeightingEntry` and `LastWeightingResponse` types
- `mock-server/routes/weighting.js`: Add CSV download endpoint (`GET /weighting/runs/:runId/download`)

### New Components (Files to Create)

| File | Purpose |
|------|---------|
| `src/modules/pesaje/index.ts` | Module definition (`pesajeModule`) |
| `src/modules/pesaje/types.ts` | TypeScript interfaces and constants |
| `src/modules/pesaje/pages/PesajePage.tsx` | Main page: period selector + country card grid |
| `src/modules/pesaje/components/WeightingCountryCard.tsx` | Per-country card with status, trigger, progress |
| `src/modules/pesaje/components/WeightingConfigDialog.tsx` | Parameter configuration dialog |
| `src/modules/pesaje/components/WeightingDetailModal.tsx` | Run detail modal with summary stats |
| `src/modules/pesaje/components/WeightingProgress.tsx` | Step-based pipeline progress visualization |
| `src/modules/pesaje/components/WeightingHistoryModal.tsx` | Past runs list with CSV download |
| `src/modules/pesaje/hooks/useWeighting.ts` | Hooks: create, execute, poll, cancel runs |
| `src/modules/pesaje/hooks/useLastWeighting.ts` | Hook for last weighting date per country |

## Edge Cases & Constraints

1. **Concurrent runs for same country/period**: The UI should prevent triggering a new run while one is already `running` or `pending` for the same country/period combination. The "Ejecutar" button must be disabled in this state.

2. **Navigation away during active run**: If the user navigates to another module while a pipeline is running, the run continues server-side. When they return, the card should reflect the current status via the polling mechanism. No client-side state is lost because all state comes from the API.

3. **Stale polling data**: The `refetchInterval` in React Query handles polling. When no runs are in active status, polling must stop to avoid unnecessary API calls. Use `WEIGHTING_ACTIVE_STATUSES` to determine when to poll.

4. **Mock server unavailable**: If the API is unreachable, Axios error interceptor transforms the error into an `ApiError`. The country card should show an error state, not crash. React Query's `error` state handles this.

5. **Empty results on completed run**: A completed run might have `summary_stats: null` if the backend encountered an edge case. The detail modal should handle this gracefully with a "No statistics available" message.

6. **Period format consistency**: The `PeriodSelector` produces a string `YYYYMM`, but the API expects `period` as a number. The conversion (`parseInt`) must be applied consistently, matching the pattern in `EligibilityCountryCard.periodStringToNumber`.

## Assumptions

- The weighting pipeline steps are: `load_eligible`, `calculate_weights`, `validate_distributions`, `export_results`, `complete` (placeholder steps, may change when backend is implemented).
- The configurable parameters use placeholder fields (`max_weight`, `min_weight`, `cv_threshold`, `max_iterations`, `trim_percentile`). These will be updated when the backend pipeline spec is finalized.
- The mock server's `RunStore` pattern is sufficient for simulating weighting run behavior (same as prices and MTR modules).
- Only summary statistics are shown in the results view; histogram visualizations are deferred.
- The CSV download endpoint returns the full weighting results table (households with assigned weights).
- `COUNTRY_FLAGS` and `COUNTRY_LABELS` maps will be duplicated in the weighting components (same as in elegibilidad). Extraction to a shared utility under `src/lib/countries.ts` is deferred to a cross-module cleanup task.
- The `formatRelativeTime` utility will be duplicated from `EligibilityCountryCard`. Same deferral as above.
- Existing tests in `src/__tests/` use Vitest + React Testing Library + vi.mock for API mocking. Weighting module tests should follow the same pattern.

## Acceptance Criteria

1. - [ ] **AC-01**: Weighting module appears in navigation sidebar when `modules.weighting` is `true` in app config and is hidden when `false`.
2. - [ ] **AC-02**: Country cards render for all 9 LATAM countries showing the last weighting completion date (or "never" if none) and the selected period.
3. - [ ] **AC-03**: Clicking "Ejecutar" on a country card opens a confirmation dialog; confirming creates a run via `POST /weighting/runs` and triggers execution via `POST /weighting/runs/:id/execute`.
4. - [ ] **AC-04**: Configuration dialog allows setting weighting parameters (key-value pairs) before triggering, and parameters are sent in the `parameters_json` field of the created run.
5. - [ ] **AC-05**: Active runs display step-by-step progress using `WeightingProgress` component, polling at most every 3 seconds, updating automatically as steps complete.
6. - [ ] **AC-06**: Completed runs display summary statistics in the detail modal: min weight, max weight, mean weight, median weight, std dev, total households, and weighted households.
7. - [ ] **AC-07**: Clicking "Detener" on a running pipeline sends `POST /weighting/runs/:id/cancel` and the card updates to show cancelled status.
8. - [ ] **AC-08**: History modal lists past weighting runs for a country with status, period, and completion date, with a download button that triggers CSV download.
9. - [ ] **AC-09**: Failed runs display the error message on the country card and in the detail modal, with a "Re-ejecutar" button that creates a new run with the same parameters.
10. - [ ] **AC-10**: The `pesajeModule` is registered in `src/modules/registry.ts` and follows the `ModuleDefinition` interface with `id: "weighting"`, `group: "pipeline"`.

## Testing

Tests follow the existing pattern in `src/__tests/` (Vitest + React Testing Library + `vi.mock` for API functions).

### Required Tests

| Test File | What it verifies |
|-----------|-----------------|
| `src/__tests__/PesajePage.test.tsx` | PesajePage renders country cards, period selector works, error states display |
| `src/__tests__/WeightingCountryCard.test.tsx` | Card shows status, triggers create+execute on confirm, cancel works, error/retry flow |

### Test Patterns

- Mock `@/lib/api` named exports with `vi.mock`
- Mock `@azure/msal-react` (existing pattern)
- Mock `sonner` toast for success/error assertions
- Wrap components in `QueryClientProvider` + `MemoryRouter`
- Use `waitFor` for async state updates from React Query

## Dependencies

- **SPEC-module-registry**: Module definition type system and registry pattern must be in place (currently implemented).
- **SPEC-mock-server**: Mock server with `RunStore` and weighting routes must be running (currently implemented at `mock-server/routes/weighting.js`).
- **Existing shared components**: `PeriodSelector`, `useCountries`, `useModuleConfig`, shadcn/ui components.

## Estimated Effort

- **T-shirt size**: M
- **Suggested breakdown**: 6 tasks across 3 phases:
  - **Phase 1 (Foundation)**: Types, API client functions, mock server CSV endpoint, module registration
  - **Phase 2 (UI Components)**: PesajePage, WeightingCountryCard, WeightingConfigDialog, WeightingProgress, WeightingDetailModal, WeightingHistoryModal, hooks
  - **Phase 3 (Testing)**: PesajePage tests, WeightingCountryCard tests

## Open Questions

1. What are the exact pipeline steps for weighting? (Using placeholder steps: load_eligible, calculate_weights, validate_distributions, export_results, complete)
2. What configurable parameters does the weighting pipeline accept? (Using generic key-value form initially)

## Linear Issues

| Issue | Title | Requirements | Status |
|-------|-------|-------------|--------|
| [JAA-230](https://linear.app/jaalduna/issue/JAA-230) | Weighting module foundation: types, API client, mock CSV endpoint, registry | NFR-03, FR-01 (partial) | Done |
| [JAA-233](https://linear.app/jaalduna/issue/JAA-233) | Weighting hooks, PesajePage, and config dialog | FR-01, FR-02, NFR-01, NFR-02 | Done |
| [JAA-239](https://linear.app/jaalduna/issue/JAA-239) | WeightingCountryCard with trigger, progress, cancel, and error/retry | FR-03, FR-04, FR-06, FR-09 | Done |
| [JAA-246](https://linear.app/jaalduna/issue/JAA-246) | WeightingDetailModal and WeightingHistoryModal — results, CSV, history | FR-02, FR-05, FR-07, FR-08 | Done |
| [JAA-252](https://linear.app/jaalduna/issue/JAA-252) | Weighting module tests — PesajePage and WeightingCountryCard | Testing | Done |

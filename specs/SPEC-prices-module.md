# Spec: Prices Module

**Slug**: `prices-module`
**PRD**: `PRD-ms-process-app`
**PRD Features**: F-01
**Status**: done
**Priority**: Must-have
**Phase**: Phase 2 -- Core Modules
**Depends on**: SPEC-module-registry, SPEC-mock-server
**Created**: 2026-04-02

---

## Problem

Price validation -- checking that prices declared in household purchases are aligned with historical product prices and detecting/cleaning outliers -- is currently performed manually by the Prices Specialist using ad-hoc scripts and Databricks notebooks. There is no front-end interface to trigger validation, review flagged outliers, or approve cleaned data. This increases cycle time and risk of human error.

## Requirements

### Functional

1. **FR-01**: Display a country-card grid showing all 9 LATAM countries with their last price validation date and current period.
   - *Rationale*: Provides at-a-glance status for the Prices Specialist across all countries.
2. **FR-02**: Allow the Prices Specialist to select a country and period (YYYYMM) and trigger a price validation pipeline via `POST /prices/runs` + `POST /prices/runs/:runId/execute`.
   - *Rationale*: Replaces manual Databricks notebook execution with a one-click action.
3. **FR-03**: Show real-time step-based progress of the validation pipeline by polling `GET /prices/runs/:runId` at intervals no shorter than 3 seconds, displaying steps: `load_data`, `detect_outliers`, `generate_report`, `complete`.
   - *Rationale*: Gives visibility into pipeline progress without requiring Databricks workspace access.
4. **FR-04**: Display outlier results -- flagged products/prices with columns: product name, declared price, historical average, deviation percentage, reason, and household ID -- in a sortable, filterable data table when run status is `results_ready`.
   - *Rationale*: Enables the specialist to review flagged items before approving.
5. **FR-05**: Allow the specialist to approve cleaned data via `POST /prices/runs/:runId/approve`, which transitions the run from `results_ready` to `approved`, recording `approved_by` and `approved_at`.
   - *Rationale*: Provides an auditable approval workflow.
6. **FR-06**: Support cancellation of a running validation via `POST /prices/runs/:runId/cancel`, transitioning the run to `cancelled` status.
   - *Rationale*: Allows aborting long-running or mistakenly triggered validations.
7. **FR-07**: Show validation history per country via `GET /prices/runs?country=X` with status, period, and completion dates in a modal dialog.
   - *Rationale*: Enables historical review and audit trail.
8. **FR-08**: Allow downloading validation results as CSV by triggering a client-side export from the outlier results table.
   - *Rationale*: Supports offline review and reporting.
9. **FR-09**: Show error details (from `error_message` field) and support retry (re-execute) when a validation fails.
   - *Rationale*: Enables self-service error recovery without backend intervention.

### Non-Functional

1. **NFR-01**: Pipeline progress polling must use `refetchInterval` of at least 3000ms to avoid backend overload.
   - *Rationale*: Prevents excessive API calls when multiple countries are being monitored simultaneously.
2. **NFR-02**: The module must follow the established country-card grid layout pattern from Calibration/Eligibility modules (PeriodSelector + grid of cards with status badges, progress indicators, and action buttons).
   - *Rationale*: Ensures visual consistency across the application.
3. **NFR-03**: The module must register via `ModuleDefinition` in `src/modules/precios/index.ts` and be added to the `allModules` array in `src/modules/registry.ts`.
   - *Rationale*: Required for the dynamic module registry system to discover and render the module.

## Scope

### In Scope
- `src/modules/precios/` directory with pages, components, hooks, types
- Module registration via `ModuleDefinition` and addition to `allModules` registry
- Country card grid page with period selector
- Price validation trigger (create run + execute) and real-time progress polling
- Outlier review table with approve action
- Validation history modal
- Client-side CSV export of outlier results
- API client functions in `src/lib/api.ts`

### Out of Scope
- Backend pipeline implementation (mock server already provides endpoints)
- Outlier detection algorithm logic
- Upload of corrected price data (deferred -- see Open Question #7 in PRD)
- Individual product-level approve/reject (approval is all-or-nothing for the run)

## User Stories Covered

- **US-01**: Trigger price validation for a specific country and period
- **US-02**: Review flagged price outliers and approve/reject corrections
- **US-10**: Real-time progress feedback
- **US-11**: Error details and retry

## Design

### Module Definition

```typescript
// src/modules/precios/index.ts
import { lazy } from "react"
import type { ModuleDefinition } from "../types"

export const preciosModule: ModuleDefinition = {
  id: "prices",
  label: "Precios",
  group: "pipeline",
  navItems: [{ path: "/precios", label: "Precios" }],
  routes: [{ path: "/precios", component: lazy(() => import("./pages/PreciosPage").then(m => ({ default: m.PreciosPage }))) }],
}
```

### Module Config Integration

The `useModuleConfig` hook in `src/hooks/useModuleConfig.ts` already includes `prices: config?.prices ?? false`. No changes needed there. To enable the module during development, set `modules.prices = true` in the app config or use the mock-server's default config.

### API Endpoints

The mock server (`mock-server/routes/prices.js` and `mock-server/server.js`) defines these endpoints. The frontend API client must implement corresponding functions:

| HTTP Method | Endpoint | Purpose | API Client Function |
|-------------|----------|---------|-------------------|
| `POST` | `/prices/runs` | Create a new validation run | `createPricesRun(data: PricesRunCreate)` |
| `GET` | `/prices/runs` | List runs (filterable by country, period, status) | `getPricesRuns(params?)` |
| `GET` | `/prices/runs/:runId` | Get run detail with steps and outliers | `getPricesRun(runId: string)` |
| `POST` | `/prices/runs/:runId/execute` | Start pipeline execution | `executePrices(runId: string)` |
| `POST` | `/prices/runs/:runId/approve` | Approve results (requires `results_ready` status) | `approvePrices(runId: string)` |
| `POST` | `/prices/runs/:runId/cancel` | Cancel running/pending run | `cancelPrices(runId: string)` |
| `GET` | `/metadata/last-prices` | Get last completed/approved run per country | `getLastPrices()` |

The `getLastPrices()` endpoint returns `{ countries: Record<string, { country, completed_at, run_id, period }> }` -- same shape as `LastSyncResponse` in `src/types/api.ts`.

### Page Layout

Follows the same pattern as `CalibrationPage.tsx`:
- Period selector at top (reuses `PeriodSelector` component)
- Country card grid (responsive: `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`)
- Each card shows: country name with flag, last validation date, trigger/cancel button, progress indicator
- Click card to open history modal with past validations
- Detail modal opens from a dedicated eye icon button showing outlier results table

### Key Components

| Component | Description |
|-----------|-------------|
| `PreciosPage` | Main page: period selector + country card grid. Analogous to `CalibrationPage.tsx`. |
| `PricesCountryCard` | Per-country card with status, trigger/cancel buttons, progress. Analogous to `CountryCard.tsx`. Replicates `COUNTRY_FLAGS` and `COUNTRY_LABELS` constants locally (same pattern as calibration). |
| `PricesDetailModal` | Run detail modal with **two sections**: (1) pipeline step progress using `PricesProgress`, and (2) outlier results table with sortable columns, approve action, and CSV export button. This is structurally different from `CalibrationDetailModal` which only shows step progress. |
| `PricesProgress` | Step-based pipeline visualization (4 steps). Analogous to `CalibrationProgress.tsx`. Simpler than calibration since there are no sub-tasks or nested queries. |
| `PricesHistoryModal` | Past validations list per country. Analogous to `CalibrationHistoryModal.tsx`. |

### Hooks

| Hook | Signature | Description |
|------|-----------|-------------|
| `usePricesRuns(country?, period?)` | Returns `{ data: PricesRun[], ... }` | Lists runs for a country/period. Polls at 3s when any run is active. Uses `getPricesRuns`. |
| `usePricesRun(runId)` | Returns `{ data: PricesRun, ... }` | Fetches single run detail. Polls at 3s when status is `running` or `pending`. Uses `getPricesRun`. |
| `useCreatePricesRun()` | Returns `useMutation` | Creates a new run via `createPricesRun`. Invalidates `prices-runs` queries on success. |
| `useExecutePrices()` | Returns `useMutation` | Starts pipeline via `executePrices`. Invalidates run queries on success. |
| `useApprovePrices()` | Returns `useMutation` | Approves via `approvePrices`. Invalidates run queries on success. |
| `useCancelPrices()` | Returns `useMutation` | Cancels via `cancelPrices`. Invalidates run queries on success. |
| `useLastPrices()` | Returns `{ data: Record<string, LastEntry> }` | Fetches last completed/approved run per country via `getLastPrices`. Used by `PricesCountryCard` to show "last validation" date. |
| `usePricesHistory(country, enabled)` | Returns `{ data, isLoading, isError }` | Fetches run history for a country when the history modal is open. Uses `getPricesRuns({ country, limit: 20 })`. |

Note: Unlike the calibration module which uses a `CalibrationContext` to track active job IDs per country, the prices module follows the eligibility pattern -- each card fetches runs for its country and finds the latest active one. This is simpler because the prices module uses a dedicated `/prices/runs` endpoint rather than the shared `/events` endpoint.

### Data Flow

```
User selects period + clicks "Validar" on country card
  |
  v
POST /prices/runs { country, period }  -->  PricesRun (status: pending)
  |
  v
POST /prices/runs/:runId/execute       -->  PricesRun (status: running)
  |
  v
Poll GET /prices/runs/:runId @ 3s      -->  PricesRun with steps[] updating
  |                                          (load_data -> detect_outliers -> generate_report -> complete)
  v
Status reaches "results_ready"          -->  outliers[] populated
  |
  v
User reviews outliers in PricesDetailModal
  |
  +---> Approve: POST /prices/runs/:runId/approve  -->  status: "approved"
  +---> CSV: Client-side export of outliers[] array
```

State transitions: `pending` -> `running` -> `results_ready` -> `approved`
Error path: `running` -> `failed` (retry creates new run)
Cancel path: `running` -> `cancelled`

### Types

```typescript
// src/modules/precios/types.ts

/** Price validation pipeline step names (ordered). */
export type PricesStepName = "load_data" | "detect_outliers" | "generate_report" | "complete"

/** Human-readable labels for each price validation step. */
export const PRICES_STEP_LABELS: Record<PricesStepName, string> = {
  load_data: "Cargar Datos",
  detect_outliers: "Detectar Outliers",
  generate_report: "Generar Reporte",
  complete: "Completo",
}

/** Ordered list of price validation steps for iteration. */
export const PRICES_STEPS: PricesStepName[] = [
  "load_data",
  "detect_outliers",
  "generate_report",
  "complete",
]

/** Status of a single price validation step. */
export interface PricesStep {
  name: PricesStepName
  status: "pending" | "running" | "completed" | "failed"
  started_at: string | null
  completed_at: string | null
  error: string | null
}

export type PricesStatus = "pending" | "running" | "results_ready" | "approved" | "failed" | "cancelled"

/** Statuses indicating the pipeline is actively processing. */
export const ACTIVE_PRICES_STATUSES: PricesStatus[] = ["running"]

export const PRICES_STATUS_CONFIG: Record<
  PricesStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }
> = {
  pending: { label: "Pendiente", variant: "outline", className: "" },
  running: { label: "Ejecutando...", variant: "default", className: "bg-blue-500 hover:bg-blue-500/80" },
  results_ready: { label: "Resultados listos", variant: "default", className: "bg-amber-500 hover:bg-amber-500/80" },
  approved: { label: "Aprobado", variant: "default", className: "bg-green-600 hover:bg-green-600/80" },
  failed: { label: "Error", variant: "destructive", className: "" },
  cancelled: { label: "Cancelado", variant: "secondary", className: "" },
}

/** A single flagged price outlier. */
export interface PricesOutlier {
  product: string
  declared_price: number
  historical_avg: number
  deviation_pct: number
  reason: string
  household_id: string
}

export interface PricesRun {
  run_id: string
  country: string
  period: number
  status: PricesStatus
  parameters_json?: Record<string, unknown>
  outliers?: PricesOutlier[]
  outliers_count?: number
  steps?: PricesStep[]
  current_step?: string
  started_at?: string
  completed_at?: string
  created_by?: string
  created_at: string
  updated_at: string
  approved_by?: string
  approved_at?: string
  error_message?: string
}

export interface PricesRunCreate {
  country: string
  period: number
  parameters?: Record<string, unknown>
}
```

## Files to Create / Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/modules/precios/index.ts` | Create | Module definition (`preciosModule`) |
| `src/modules/precios/types.ts` | Create | TypeScript interfaces, constants, status config (see Types section) |
| `src/modules/precios/pages/PreciosPage.tsx` | Create | Main page: period selector + country card grid |
| `src/modules/precios/components/PricesCountryCard.tsx` | Create | Country card with trigger, cancel, progress |
| `src/modules/precios/components/PricesDetailModal.tsx` | Create | Run detail modal with step progress + outlier table + approve + CSV export |
| `src/modules/precios/components/PricesProgress.tsx` | Create | Step-based pipeline progress visualization |
| `src/modules/precios/components/PricesHistoryModal.tsx` | Create | History modal with past validation runs |
| `src/modules/precios/hooks/usePrices.ts` | Create | CRUD hooks: `usePricesRuns`, `usePricesRun`, `useCreatePricesRun`, `useExecutePrices`, `useApprovePrices`, `useCancelPrices` |
| `src/modules/precios/hooks/useLastPrices.ts` | Create | Last validation date per country via `GET /metadata/last-prices` |
| `src/modules/precios/hooks/usePricesHistory.ts` | Create | History fetch hook for `PricesHistoryModal` |
| `src/lib/api.ts` | Modify | Add 7 prices API client functions (6 run endpoints + `getLastPrices`) |
| `src/modules/registry.ts` | Modify | Import `preciosModule` and add to `allModules` array (after `calibracionModule`) |

## Edge Cases & Constraints

1. **No data for selected period**: If the country has no available data for the selected period, the trigger button should be disabled with a tooltip explaining why. Follow the same pattern as Calibration's `canTrigger` guard.
2. **Concurrent runs for the same country**: The mock server allows multiple runs per country. The UI should show the most recent active run's progress on the card. If a run is already `running` or `pending`, the trigger button should be disabled.
3. **Polling during tab visibility change**: When the browser tab is inactive, `react-query`'s default behavior pauses refetch. This is acceptable and requires no special handling.
4. **Run transitions to `results_ready` (not `completed`)**: The mock server overrides `completed` to `results_ready` when outliers are generated. The UI must treat `results_ready` as the state requiring user review, not `completed`.
5. **Empty outlier results**: If the pipeline completes with zero outliers, the detail modal should show a success message instead of an empty table. The approve action should still be available.
6. **CSV export with no data**: If the outlier table is empty, the CSV export button should be disabled.

## Assumptions

- The backend API contract matches the mock server's implementation (same routes, same request/response shapes).
- Approval is all-or-nothing for the entire run (no per-product approve/reject).
- The `PricesConfigDialog` component is deferred until pipeline parameters are defined (see Open Questions). The initial implementation will use default parameters only.
- The CSV download is **client-side generation** from the `outliers[]` array already loaded in the `PricesRun` response. This differs from the calibration module which uses a server-side `GET /events/:jobId/download` endpoint. The prices module does not need a server-side download endpoint because outlier data is small and already in memory.
- Country flags and labels constants (`COUNTRY_FLAGS`, `COUNTRY_LABELS`) are duplicated in `PricesCountryCard.tsx` following the existing pattern in calibration's `CountryCard.tsx`. A future refactor could extract these to a shared utility, but that is out of scope for this spec.

## Acceptance Criteria

> These are the "definition of done". Each is verifiable.

1. [x] **AC-01**: Prices module appears in the sidebar navigation when `modules.prices` is `true` in the app config, and does not appear when `false`.
2. [x] **AC-02**: `PreciosPage` renders country cards for all 9 LATAM countries returned by `GET /metadata/countries` (filtered to `type: "country"`), each showing the country flag, name, and last validation date (or "never" if none).
3. [x] **AC-03**: Selecting a period and clicking the trigger button on a country card calls `POST /prices/runs` then `POST /prices/runs/:runId/execute`, and the card transitions to show step-based progress polling at >= 3s intervals.
4. [x] **AC-04**: When a run reaches `results_ready` status, clicking the detail button opens a modal with a sortable table displaying outlier rows with columns: Product, Declared Price, Historical Avg, Deviation %, Reason, Household ID.
5. [x] **AC-05**: Clicking "Approve" in the detail modal calls `POST /prices/runs/:runId/approve` and the run status updates to `approved` in both the modal and the country card badge.
6. [x] **AC-06**: Clicking the cancel button on a running validation calls `POST /prices/runs/:runId/cancel` and the run transitions to `cancelled` status with appropriate badge.
7. [x] **AC-07**: Clicking a country card opens a history modal showing past validation runs for that country with columns: Period, Status, Started, Completed.
8. [x] **AC-08**: The detail modal includes a "Download CSV" button that exports the outlier table to a CSV file with appropriate headers. Button is disabled when no outlier data is present.
9. [x] **AC-09**: When a run has `failed` status, the card displays the `error_message` and provides a retry button that creates a new run with the same parameters and executes it.

## Dependencies

- **SPEC-module-registry**: The dynamic module registry system must be in place for the module to register and render.
- **SPEC-mock-server**: The mock server must be running with the `/prices/*` routes for development and testing.

## Estimated Effort

- **T-shirt size**: M
- **Suggested breakdown**: 5-6 tasks across 2 phases (scaffold + core UI, then detail/history/export)

## Open Questions

1. What are the exact pipeline steps for price validation? (Using placeholder steps from mock server: `load_data`, `detect_outliers`, `generate_report`, `complete`)
2. What parameters does the prices pipeline accept? (e.g., outlier threshold percentage, lookback months, product categories). Deferred: `PricesConfigDialog` will be added when parameters are defined.
3. Does the outlier review need individual product-level approve/reject, or is it all-or-nothing? (Assumed: all-or-nothing based on mock server's single approve endpoint)

## Linear Issues

| Issue | Title | Requirements | Status |
|-------|-------|-------------|--------|
| [JAA-224](https://linear.app/jaalduna/issue/JAA-224) | Scaffold Prices module: types, API client, module registration | FR-01 (partial), NFR-03 | Done |
| [JAA-225](https://linear.app/jaalduna/issue/JAA-225) | Prices country card grid page with period selector and trigger | FR-01, FR-02, NFR-02 | Done |
| [JAA-226](https://linear.app/jaalduna/issue/JAA-226) | Pipeline progress visualization and cancel action | FR-03, FR-06, NFR-01 | Done |
| [JAA-227](https://linear.app/jaalduna/issue/JAA-227) | Outlier detail modal with sortable table and approve action | FR-04, FR-05 | Done |
| [JAA-228](https://linear.app/jaalduna/issue/JAA-228) | History modal, CSV export, and error retry | FR-07, FR-08, FR-09 | Done |

### Dependency Graph

```
JAA-224 (scaffold)
  └─► JAA-225 (page + cards)
        ├─► JAA-226 (progress + cancel)
        ├─► JAA-227 (detail modal + approve)
        └─► JAA-228 (history + CSV + retry)
```

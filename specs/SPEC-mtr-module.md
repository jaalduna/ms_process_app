# SPEC: MTR Module

**Slug**: `mtr-module`
**PRD**: `PRD-ms-process-app`
**PRD Features**: F-03
**Status**: implementing
**Priority**: Must-have
**Phase**: Phase 2 — Core Modules
**Depends on**: SPEC-module-registry, SPEC-mock-server
**Created**: 2026-04-02

---

## Problem

The MTR (deeper calibration targets and imputations) stage is the final step in the Measurement Science pipeline. It generates deeper calibration targets and computes the imputations required to achieve those targets. Currently performed manually by the MTR Specialist via Databricks notebooks, there is no front-end interface to configure parameters, trigger the pipeline, or review imputation results before they are finalized.

## Scope

### In Scope
1. `src/modules/mtr/` directory with pages, components, hooks, types
2. Module registration via `ModuleDefinition` in `src/modules/registry.ts`
3. Country card grid page with period selector
4. MTR parameter configuration dialog
5. Pipeline trigger and real-time progress
6. Imputation results view
7. MTR history modal
8. CSV download of MTR results
9. API client functions added to `src/lib/api.ts`
10. Shared country constants extraction (flags, labels) to avoid duplication

### Out of Scope
- Backend pipeline implementation (consumed via mock server / real API)
- Imputation algorithm logic
- Dependency checks on upstream calibration completion (deferred to SPEC-pipeline-deps)
- Approval workflow for MTR results (deferred; completion is sufficient for now)

## Requirements

> Each requirement is numbered, testable, and independent.

### Functional Requirements

1. **FR-01**: Display a country-card grid showing all 9 LATAM countries with their last MTR date and current period.
   - *Rationale*: The MTR Specialist needs a dashboard to see the status of each country at a glance, consistent with the calibration and eligibility modules.

2. **FR-02**: Allow the MTR Specialist to select a country and period (YYYYMM) and configure MTR parameters before triggering.
   - *Rationale*: Different countries or periods may require different parameter configurations (e.g., target thresholds, imputation methods).

3. **FR-03**: Trigger the MTR pipeline for the selected country and period via POST `/mtr/runs` followed by POST `/mtr/runs/:id/execute`.
   - *Rationale*: Two-step create+execute pattern matches the eligibility module and allows parameter review before execution.

4. **FR-04**: Show real-time step-based progress of the MTR pipeline by polling GET `/mtr/runs/:id` at a configurable interval (default 3s).
   - *Rationale*: The pipeline runs multiple steps (generate_targets, compute_imputations, validate_results, export_results) and the user needs visual feedback.

5. **FR-05**: Display imputation results — target metrics, imputation counts, and quality score — in a results view when the run completes.
   - *Rationale*: The MTR Specialist must review imputation quality before the results are considered final.

6. **FR-06**: Support cancellation of a running MTR pipeline via POST `/mtr/runs/:id/cancel`.
   - *Rationale*: Long-running pipelines may need to be stopped if parameters were wrong or upstream data issues are discovered.

7. **FR-07**: Show MTR history per country with status, period, and completion dates in a history modal.
   - *Rationale*: Specialists need to review past runs, compare results across periods, and re-download outputs.

8. **FR-08**: Allow downloading MTR results as CSV from a completed run.
   - *Rationale*: Results are shared with analysts and stakeholders outside the app.

9. **FR-09**: Show error details and support retry when an MTR run fails.
   - *Rationale*: Pipeline failures must be diagnosable without checking Databricks directly; retry should not require re-entering all parameters.

### Non-Functional Requirements

1. **NFR-01**: Pipeline progress polling interval must not exceed 3 seconds when a run is active; polling must stop when the run reaches a terminal status (completed, failed, cancelled).
   - *Rationale*: Matches the polling pattern in useEligibilityRun (2s interval) and useCalibration (2s interval).

2. **NFR-02**: Follow established country-card grid pattern (responsive grid: `sm:grid-cols-2 lg:grid-cols-3`), matching the eligibility page layout.
   - *Rationale*: Visual consistency across pipeline modules. The eligibility module uses sm:2/lg:3; calibration uses sm:2/lg:3/xl:4. Use the simpler sm:2/lg:3 layout for MTR.

3. **NFR-03**: Register via `ModuleDefinition` plugin system and appear in navigation only when `modules.mtr` is `true` in `useModuleConfig`.
   - *Rationale*: Feature-flag gating follows the established pattern (useModuleConfig.ts defaults mtr to `false`).

## User Stories Covered

- **US-05**: Trigger the MTR pipeline for a country and period
- **US-06**: Review imputation results and target metrics
- **US-10**: Real-time progress feedback
- **US-11**: Error details and retry

## Data Flow

```
User selects period + country
        |
        v
[MtrConfigDialog] -- user sets parameters -->
        |
        v
POST /mtr/runs { country, period, parameters }
        |
        v
POST /mtr/runs/:id/execute
        |
        v
Poll GET /mtr/runs/:id (every 3s)
        |
        v
[MtrProgress] shows step-by-step status
        |
    completed?
   /          \
  yes          no (failed/cancelled)
  |            |
  v            v
[MtrDetailModal]   [Error + Retry button]
shows results_summary
  |
  v
Client-side CSV generation from results_summary (Blob download)
```

## Technical Design

### Module Definition

```typescript
// src/modules/mtr/index.ts
import { lazy } from "react"
import type { ModuleDefinition } from "../types"

export const mtrModule: ModuleDefinition = {
  id: "mtr",
  label: "MTR",
  group: "pipeline",
  navItems: [{ path: "/mtr", label: "MTR" }],
  routes: [{ path: "/mtr", component: lazy(() => import("./pages/MtrPage").then(m => ({ default: m.MtrPage }))) }],
}
```

### Key Components

| Component | Description |
|-----------|-------------|
| `MtrPage` | Main page: period selector + config dialog + country card grid |
| `MtrCountryCard` | Per-country card with status badge, trigger button, progress, cancel |
| `MtrConfigDialog` | Parameter configuration dialog (opened from page header), renders `MtrParams` fields using `MTR_PARAM_META` |
| `MtrDetailModal` | Run detail with imputation results summary and CSV download |
| `MtrProgress` | Step-based pipeline visualization (step dots/bars with status) |
| `MtrHistoryModal` | Past runs list for a country with status and CSV download links |

### Types

```typescript
// src/modules/mtr/types.ts

export type MtrStepName =
  | "generate_targets"
  | "compute_imputations"
  | "validate_results"
  | "export_results"
  | "complete"

export const MTR_STEP_LABELS: Record<MtrStepName, string> = {
  generate_targets: "Generate Targets",
  compute_imputations: "Compute Imputations",
  validate_results: "Validate Results",
  export_results: "Export Results",
  complete: "Complete",
}

export const MTR_STEPS: MtrStepName[] = [
  "generate_targets",
  "compute_imputations",
  "validate_results",
  "export_results",
  "complete",
]

export type MtrStatus = "pending" | "running" | "completed" | "failed" | "cancelled"

/** Statuses where the pipeline is actively processing (excludes "pending" which is pre-execution). */
export const MTR_ACTIVE_STATUSES: MtrStatus[] = ["running"]

/** Statuses that should trigger polling (includes "pending" since it transitions to "running" after execute). */
export const MTR_POLL_STATUSES: MtrStatus[] = ["pending", "running"]

export const MTR_STATUS_CONFIG: Record<
  MtrStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }
> = {
  pending: { label: "Pendiente", variant: "outline", className: "" },
  running: { label: "Ejecutando...", variant: "default", className: "bg-blue-500 hover:bg-blue-500/80" },
  completed: { label: "Completado", variant: "default", className: "bg-green-600 hover:bg-green-600/80" },
  failed: { label: "Error", variant: "destructive", className: "" },
  cancelled: { label: "Cancelado", variant: "secondary", className: "" },
}

export interface MtrStep {
  name: MtrStepName
  status: string
  started_at?: string | null
  completed_at?: string | null
  error?: string | null
}

export interface MtrResultsSummary {
  total_targets: number
  targets_achieved: number
  total_imputations: number
  quality_score?: number
}

export interface MtrRun {
  run_id: string
  country: string
  period: number
  status: MtrStatus
  parameters_json?: Record<string, unknown>
  results_summary?: MtrResultsSummary | null
  steps?: MtrStep[]
  current_step?: string
  started_at?: string
  completed_at?: string
  created_by?: string
  created_at: string
  updated_at: string
  error_message?: string
}

export interface MtrRunCreate {
  country: string
  period: number
  parameters?: Record<string, unknown>
}

/** Placeholder MTR parameters — concrete fields TBD when backend is defined. */
export interface MtrParams {
  target_threshold: number
  imputation_method: string
  quality_min: number
}

export const DEFAULT_MTR_PARAMS: MtrParams = {
  target_threshold: 0.85,
  imputation_method: "weighted_average",
  quality_min: 0.80,
}

export const MTR_PARAM_META: Record<keyof MtrParams, { label: string; unit: string; step?: string; type?: "number" | "select"; options?: string[] }> = {
  target_threshold: { label: "Target achievement threshold", unit: "ratio", step: "0.01" },
  imputation_method: { label: "Imputation method", unit: "", type: "select", options: ["weighted_average", "nearest_neighbor", "regression"] },
  quality_min: { label: "Minimum quality score", unit: "ratio", step: "0.01" },
}
```

> **Note**: `MtrParams` is a placeholder. The fields and defaults will be refined when the backend pipeline parameters are finalized. The `MtrConfigDialog` should render these parameters dynamically using `MTR_PARAM_META`, following the pattern in `EligibilityConfigDialog`.

### API Functions

Add to `src/lib/api.ts`:

```typescript
// -- MTR --

export function getMtrRuns(params?: { country?: string; period?: number; status?: string; limit?: number; offset?: number }) {
  return api.get<{ items: MtrRun[]; total: number }>("/mtr/runs", { params }).then((r) => r.data)
}

// Note: getMtrRuns returns { items, total } (not just items) so the history modal
// can display "Showing X of Y" pagination. Hooks that only need the array should
// access .items from the result.

export function getMtrRun(runId: string) {
  return api.get<MtrRun>(`/mtr/runs/${runId}`).then((r) => r.data)
}

export function createMtrRun(data: MtrRunCreate) {
  return api.post<MtrRun>("/mtr/runs", data).then((r) => r.data)
}

export function executeMtr(runId: string) {
  return api.post<MtrRun>(`/mtr/runs/${runId}/execute`).then((r) => r.data)
}

export function cancelMtr(runId: string) {
  return api.post<MtrRun>(`/mtr/runs/${runId}/cancel`).then((r) => r.data)
}

export function getLastMtr() {
  return api.get<LastMtrResponse>("/metadata/last-mtr").then((r) => r.data)
}
```

Add to `src/types/api.ts`:

```typescript
export interface LastMtrEntry {
  country: string
  completed_at: string
  run_id: string
  period: number
}

export interface LastMtrResponse {
  countries: Record<string, LastMtrEntry>
}
```

### Affected Components

- `src/modules/registry.ts`: Import `mtrModule` and add to `allModules` array
- `src/lib/api.ts`: Add MTR API functions (getMtrRuns, getMtrRun, createMtrRun, executeMtr, cancelMtr, getLastMtr)
- `src/types/api.ts`: Add `LastMtrEntry` and `LastMtrResponse` interfaces

### New Components

| File | Purpose |
|------|---------|
| `src/modules/mtr/index.ts` | Module definition |
| `src/modules/mtr/types.ts` | TypeScript interfaces, step labels, status config |
| `src/modules/mtr/pages/MtrPage.tsx` | Main page with period selector, config dialog, country grid |
| `src/modules/mtr/components/MtrCountryCard.tsx` | Country card with status, trigger, progress, cancel |
| `src/modules/mtr/components/MtrConfigDialog.tsx` | Parameter configuration dialog |
| `src/modules/mtr/components/MtrDetailModal.tsx` | Run detail modal with imputation results |
| `src/modules/mtr/components/MtrProgress.tsx` | Step-based pipeline progress visualization |
| `src/modules/mtr/components/MtrHistoryModal.tsx` | History modal with past runs and CSV download |
| `src/modules/mtr/hooks/useMtr.ts` | Hooks: useMtrRuns, useMtrRun, useCreateMtrRun, useExecuteMtr, useCancelMtr |
| `src/modules/mtr/hooks/useLastMtr.ts` | Hook for last MTR date per country |
| `src/modules/mtr/hooks/useMtrHistory.ts` | Hook for paginated MTR history by country (used in MtrHistoryModal) |
| `src/modules/mtr/utils/downloadMtrCsv.ts` | Client-side CSV generation from MtrRun results_summary |

### Shared Constants Note

`COUNTRY_FLAGS` and `COUNTRY_LABELS` are currently duplicated in `calibracion/components/CountryCard.tsx` and `elegibilidad/components/EligibilityCountryCard.tsx`. For the MTR module, either:
- (a) Import from one of the existing modules, or
- (b) Extract to `src/lib/countries.ts` as a shared constant (preferred, can be a follow-up refactor)

For this spec, the MTR module may duplicate them locally for consistency with existing modules, with extraction deferred to a shared-constants spec.

## Edge Cases & Constraints

1. **Concurrent runs for same country+period**: The mock server returns 409 Conflict if a run is already executing. The UI must disable the trigger button when a run is in `running` or `pending` status for the selected country+period.

2. **Null `results_summary` on completed run**: The `results_summary` field may be `null` even on a completed run if the backend encountered a partial failure. The detail modal must handle this gracefully (show "Results unavailable" instead of crashing).

3. **Network errors during polling**: If a poll request fails, the polling should continue (tanstack-query handles this by default) rather than stopping. A transient network error should not terminate the progress view.

4. **Period mismatch**: If the user changes the period while a run is in progress, the country card should still show the active run's progress (tracked by run_id, not by period).

5. **CSV download for non-completed runs**: The download button must only appear for runs with status `completed` and non-null `results_summary`.

6. **Missing CSV download endpoint in mock server**: The mock server does not implement `GET /mtr/runs/:id/download`. For the initial implementation, CSV download should be implemented as **client-side generation** from the `results_summary` data (using `Blob` + `URL.createObjectURL`). When the real backend is available, this can be swapped for a server-side endpoint. The `MtrDetailModal` and `MtrHistoryModal` should use a shared `downloadMtrCsv(run: MtrRun)` utility function.

## Assumptions

- The mock server at `mock-server/routes/mtr.js` already implements all required endpoints (POST /mtr/runs, GET /mtr/runs, GET /mtr/runs/:id, POST /mtr/runs/:id/execute, POST /mtr/runs/:id/cancel, GET /metadata/last-mtr). No mock server changes are needed.
- The `useModuleConfig` hook already includes `mtr: false` as a default, so feature-flag gating is already wired.
- MTR pipeline steps are: generate_targets, compute_imputations, validate_results, export_results, complete. These are placeholders and may change when the backend is implemented.
- CSV download will be implemented client-side (generating a CSV blob from `results_summary` fields). No backend download endpoint is required for the initial implementation.

## Acceptance Criteria

> These are the "definition of done". Each is verifiable.

1. [ ] **AC-01**: `mtrModule` is exported from `src/modules/mtr/index.ts` and registered in `src/modules/registry.ts` allModules array. Navigation shows "MTR" when `modules.mtr` is `true` in `useModuleConfig`.
2. [ ] **AC-02**: `MtrPage` renders a responsive country-card grid (`sm:grid-cols-2 lg:grid-cols-3`) for all countries returned by `useCountries()` where `type === "country"`. Each card shows the country flag, label, and last MTR date from `useLastMtr()`.
3. [ ] **AC-03**: `MtrConfigDialog` opens from the page header, renders parameter fields from `MTR_PARAM_META` with defaults from `DEFAULT_MTR_PARAMS`, and passes the configured `MtrParams` to the trigger flow.
4. [ ] **AC-04**: Clicking "Ejecutar" on a country card creates a run via `createMtrRun()` then executes via `executeMtr()`, and the card transitions to show step-by-step progress via `MtrProgress`.
5. [ ] **AC-05**: `MtrProgress` component visualizes the 5 pipeline steps with status indicators (pending/running/completed/failed) matching the step data from the polled run.
6. [ ] **AC-06**: `MtrDetailModal` displays `results_summary` fields (total_targets, targets_achieved, total_imputations, quality_score) when the run is completed. Shows "Results unavailable" when `results_summary` is null.
7. [ ] **AC-07**: Cancel button appears during a running pipeline, calls `cancelMtr()`, and the run transitions to `cancelled` status with polling stopped.
8. [ ] **AC-08**: `MtrHistoryModal` lists past runs for the selected country with status badges, period, and completion dates. Completed runs show a CSV download action.
9. [ ] **AC-09**: When a run fails, the error message displays on the card and in the detail modal. A retry button triggers a new run with the same parameters.
10. [ ] **AC-10**: Polling interval is 3 seconds or less during active runs and stops automatically when the run reaches a terminal status (completed, failed, cancelled).

## Open Questions

1. What are the exact configurable parameters for the MTR pipeline? (Placeholder `MtrParams` defined with `target_threshold`, `imputation_method`, `quality_min` -- to be refined.)
2. What quality metrics beyond `quality_score` should be displayed for imputation results?
3. ~~Should CSV download be a direct backend endpoint or a client-side export?~~ **Resolved**: Client-side CSV generation for now; server endpoint when backend is ready.
4. Does MTR need an approval workflow in the future, or is completion sufficient?

## Dependencies

- **SPEC-module-registry**: Module registration system must be in place
- **SPEC-mock-server**: Mock server with MTR routes must be running
- Mock server endpoint `GET /metadata/last-mtr` (already implemented in `mock-server/server.js:37`)
- Mock server MTR routes (already implemented in `mock-server/routes/mtr.js`)

## Estimated Effort

- **T-shirt size**: M
- **Suggested breakdown**: 5 tasks across 2 phases (types+API+registration, then components+hooks+page)

## Linear Issues

| Issue | Title | Requirements | Depends on | Status |
|-------|-------|-------------|------------|--------|
| JAA-231 | MTR: types, API client, and module registration | FR-01 (partial), NFR-03 | (none) | In Review |
| JAA-234 | MTR: MtrPage with country card grid and useLastMtr hook | FR-01, FR-02 (partial), NFR-02 | JAA-231 | In Review |
| JAA-237 | MTR: MtrHistoryModal with past runs and CSV download | FR-07, FR-08 | JAA-231 | In Review |
| JAA-248 | MTR: MtrConfigDialog, MtrCountryCard trigger flow, and MtrProgress | FR-02, FR-03, FR-04, FR-06, NFR-01 | JAA-234 | In Review |
| JAA-253 | MTR: MtrDetailModal with results view, error display, and retry | FR-05, FR-06, FR-08, FR-09 | JAA-248 | In Review |

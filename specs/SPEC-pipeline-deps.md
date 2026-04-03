# Spec: Pipeline Dependency Awareness

**Slug**: `pipeline-deps`
**PRD**: `PRD-ms-process-app`
**PRD Features**: F-05
**Status**: done
**Priority**: Should-have
**Phase**: Phase 4 -- Cross-cutting
**Depends on**: SPEC-prices-module, SPEC-weighting-module, SPEC-mtr-module
**Created**: 2026-04-02

---

## Problem

The Measurement Science pipeline is sequential: Prices -> Eligibility -> Weighting -> Calibration -> MTR. Each stage depends on the successful completion of the upstream stage for the same country and period. Currently, specialists have no visibility into whether upstream stages have completed before triggering their own, leading to wasted runs (triggering with stale or missing input data) and manual coordination via chat/email.

## Scope

### In Scope
- Upstream dependency indicator component (reusable across all pipeline modules)
- Integration into existing Calibration and Eligibility country cards
- Integration into new Prices, Weighting, and MTR country cards (provided by SPEC-prices-module, SPEC-weighting-module, SPEC-mtr-module)
- Soft-gate UX (warning, not blocking)
- Graceful degradation for unavailable dependency data
- Utilizing existing mock server metadata endpoints for last-prices, last-weighting, last-mtr (already present in `mock-server/server.js`)

### Out of Scope
- Hard-blocking triggers based on dependency status
- Automatic triggering of downstream stages when upstream completes
- Cross-country dependency visualization
- Modifying the existing `DataAvailabilityBadge` component (Calibration-specific, stays as-is)
- Detecting `running` status from upstream stages (v1 only shows `completed`, `not_run`, or `unknown` -- see Design Decision DD-01)

## Requirements

> Each requirement is numbered, testable, and independent.

### Functional Requirements

1. **FR-01**: Each pipeline module's country card must display the completion status of its upstream dependencies for the selected period.
   - *Rationale*: Specialists need to see at a glance whether upstream stages are ready before triggering.
2. **FR-02**: Dependency status must show one of: `completed` (with date), `not_run`, or `unknown` -- for each upstream stage.
   - *Rationale*: These three states are what the last-completion endpoints can reliably determine. See DD-01 for why `running` and `failed` are excluded in v1.
3. **FR-03**: If upstream dependencies are not met (any dependency is not `completed`), the trigger button must show a warning tooltip but still allow the specialist to proceed (soft gate, not hard block).
   - *Rationale*: Specialists sometimes need to re-run with known stale data; blocking would reduce flexibility.
4. **FR-04**: Dependency data must be fetched from existing metadata endpoints. Each endpoint maps to one pipeline stage:
   - `/metadata/last-prices` (mock server) -> prices stage completion
   - `/metadata/last-elegibilidad` (backend + mock) -> eligibility stage completion
   - `/metadata/last-weighting` (mock server) -> weighting stage completion
   - `/metadata/last-calibration` (backend + mock) -> calibration stage completion
   - `/metadata/last-mtr` (mock server) -> MTR stage completion
   - Note: `/metadata/last-sync` tracks the `inicio` (data sync) stage, NOT prices. It is not used in this feature.
   - *Rationale*: Reuse existing endpoints with correct stage-to-endpoint mapping.
5. **FR-05**: If a dependency endpoint is unavailable (network error, 500, etc.), show `unknown` status with a neutral grey "?" indicator -- no broken UI, no error toasts.
   - *Rationale*: The dependency indicator is supplementary info; its failure must not degrade the core workflow.
6. **FR-06**: The dependency chain must be configurable per stage:
   - `prices`: no upstream dependencies (sync is automatic every 2h)
   - `elegibilidad`: depends on `prices`
   - `weighting`: depends on `elegibilidad`
   - `calibration`: depends on `weighting` (existing `DataAvailability` checks remain in parallel)
   - `mtr`: depends on `calibration`
   - *Rationale*: A declarative config makes adding new stages trivial.
7. **FR-07**: The `usePipelineDeps` hook must use TanStack Query's `useQueries` to fire all upstream dependency fetches in parallel, with per-query caching and deduplication.
   - *Rationale*: `useQueries` gives per-endpoint caching, in-flight deduplication, and independent error handling out of the box. Better than a manual `Promise.all` inside a single `useQuery`.
8. **FR-08**: Each dependency status pill must use both icon and color to convey state, and include an `aria-label` attribute describing the status for screen reader accessibility.
   - *Rationale*: Color-only indicators are not accessible to color-blind users or screen readers.

### Non-Functional Requirements

1. **NFR-01**: Dependency status resolution must not add more than 1 additional network roundtrip per unique endpoint per page load. TanStack Query's `useQueries` with `staleTime: 60s` ensures deduplication when multiple cards reference the same upstream endpoint.
   - *Rationale*: Page load performance must not regress.
2. **NFR-02**: Dependency data must use TanStack Query with `staleTime: 60_000` (60s), consistent with existing hooks like `useDataAvailability` and `useLastSync`.
   - *Rationale*: Avoids excessive polling while keeping data reasonably fresh.
3. **NFR-03**: The `DependencyIndicator` component must render correctly with 0 to 4 dependency pills (max upstream chain length) without layout overflow or wrapping issues on cards >= 280px wide.
   - *Rationale*: Country cards have variable widths; the indicator must be responsive.

## Design Decisions

### DD-01: V1 excludes `running` and `failed` upstream status detection

The existing `/metadata/last-*` endpoints only return the last **completed** run per country (via `RunStore.lastCompleted()` which filters for `status === "completed" || status === "approved"`). Detecting whether an upstream stage is currently `running` or has `failed` would require additional API calls to the runs list endpoints (`/prices/runs?status=running&country=X`), adding N extra calls per country per page.

**Decision**: V1 shows only `completed` (upstream has a last-completed entry) vs `not_run` (no entry). `unknown` is used for endpoint errors. A future enhancement can add `running`/`failed` detection by extending the last-completion endpoints to also return the latest run regardless of status.

### DD-02: Only direct upstream dependencies are shown

The indicator shows only the direct upstream stage (e.g., calibration shows only weighting status), not the full transitive chain. This is intentional because:
- If weighting is `completed`, it implies eligibility was completed before it (you can't run weighting without eligible data)
- Showing 4 pills for calibration (prices + eligibility + weighting + calibration) would be visually noisy
- The specialist for each stage is different; they care about their immediate upstream, not the full chain

## Data Flow

```
[Page Load]
  -> usePipelineDeps(stage, country, period)
    -> useQueries([
         { queryKey: ["last-prices"], queryFn: getLastPrices, staleTime: 60s },
         { queryKey: ["last-elegibilidad"], queryFn: getLastElegibilidad, staleTime: 60s },
         // ... only queries for upstream stages of the current stage
       ])
    -> For each upstream stage: check if countries[country] exists in the response
       - exists -> "completed" (with completed_at date)
       - not exists -> "not_run"
       - query error -> "unknown"
    -> Return { dependencies: DependencyStatus[], allMet: boolean, loading: boolean }
  -> <DependencyIndicator dependencies={deps} />
    -> Render status pills: [check-icon Precios] [dash-icon Elegib.]
    -> If !allMet: trigger button gets warning tooltip
```

## Technical Design

### Type Definitions

```typescript
// src/types/api.ts (additions)

// Unified type for last-completion responses from prices, weighting, mtr stores
// Note: sync/calibration endpoints use LastSyncEntry (with job_id field)
//       prices/weighting/mtr endpoints use run_id field
// This type covers both shapes.
export interface LastStageCompletionEntry {
  country: string
  completed_at: string
  job_id?: string   // present in sync/calibration endpoints
  run_id?: string   // present in prices/weighting/mtr endpoints
  period?: number | string
  stage?: string    // present in sync endpoints
}

export interface LastStageCompletionResponse {
  countries: Record<string, LastStageCompletionEntry>
}
```

### Dependency Indicator Component

```typescript
// src/components/DependencyIndicator.tsx
export type DepStatusValue = "completed" | "not_run" | "unknown"

export interface DependencyStatus {
  stage: string
  label: string
  status: DepStatusValue
  completed_at?: string
}

export interface DependencyIndicatorProps {
  dependencies: DependencyStatus[]
}
```

Each pill renders:
- `completed`: green CheckCircle2 icon + stage label, tooltip with completion date, `aria-label="Precios: completed 2h ago"`
- `not_run`: grey MinusCircle icon + stage label, `aria-label="Precios: not yet run"`
- `unknown`: grey HelpCircle icon + stage label, `aria-label="Precios: status unknown"`

Visual design: A compact row of status pills below each country card's header:

```
+------------------------------+
|  Chile                       |
|  [check Precios] [dash Elegib.]   |
|  Warning: Upstream not complete    |
|  ...                         |
+------------------------------+
```

### Dependency Configuration

```typescript
// src/lib/pipeline-deps.ts
export const PIPELINE_ORDER = ["prices", "elegibilidad", "weighting", "calibration", "mtr"] as const
export type PipelineStage = typeof PIPELINE_ORDER[number]

export const STAGE_DEPENDENCIES: Record<PipelineStage, PipelineStage[]> = {
  prices: [],
  elegibilidad: ["prices"],
  weighting: ["elegibilidad"],
  calibration: ["weighting"],
  mtr: ["calibration"],
}

export const STAGE_LABELS: Record<PipelineStage, string> = {
  prices: "Precios",
  elegibilidad: "Elegibilidad",
  weighting: "Pesaje",
  calibration: "Calibracion",
  mtr: "MTR",
}

/** Maps each pipeline stage to the API function that fetches its last-completion data. */
export const STAGE_FETCHERS: Record<PipelineStage, () => Promise<LastStageCompletionResponse>> = {
  prices: getLastPrices,
  elegibilidad: getLastElegibilidad,
  weighting: getLastWeighting,
  calibration: getLastCalibration,
  mtr: getLastMtr,
}
```

### Hook

```typescript
// src/hooks/usePipelineDeps.ts
import { useQueries } from "@tanstack/react-query"

function usePipelineDeps(stage: PipelineStage, country: string): {
  dependencies: DependencyStatus[]
  allMet: boolean
  loading: boolean
}
```

Note: The `period` parameter was removed from the hook signature because the last-completion endpoints are not period-scoped -- they return the latest completion regardless of period. The completion date is shown so the specialist can judge recency.

The hook internally:
1. Looks up `STAGE_DEPENDENCIES[stage]` to get upstream stages
2. For each upstream stage, creates a query config using `STAGE_FETCHERS[stage]`
3. Passes them to `useQueries()`
4. Maps results to `DependencyStatus[]` by checking if `countries[country]` exists

### API Layer Additions

```typescript
// src/lib/api.ts (additions)
export function getLastPrices() {
  return api.get<LastStageCompletionResponse>("/metadata/last-prices").then((r) => r.data)
}

export function getLastWeighting() {
  return api.get<LastStageCompletionResponse>("/metadata/last-weighting").then((r) => r.data)
}

export function getLastMtr() {
  return api.get<LastStageCompletionResponse>("/metadata/last-mtr").then((r) => r.data)
}
```

Note: `getLastElegibilidad()` and `getLastCalibration()` already exist in `src/lib/api.ts`. Their existing response types (`LastElegibilidadResponse`, `LastSyncResponse`) are compatible with `LastStageCompletionResponse` (both have `countries: Record<string, { country, completed_at, ... }>`).

### Affected Components
- `src/modules/calibracion/components/CountryCard.tsx`: Add `<DependencyIndicator>` below header badges, add warning tooltip on trigger button when `!allMet`
- `src/modules/elegibilidad/components/EligibilityCountryCard.tsx`: Add `<DependencyIndicator>` below header, add warning tooltip on "Ejecutar" button when `!allMet`
- `src/modules/pesaje/components/WeightingCountryCard.tsx`: Add `<DependencyIndicator>` (from SPEC-weighting-module)
- `src/modules/precios/components/PricesCountryCard.tsx`: No indicator needed (prices has no upstream deps)
- `src/modules/mtr/components/MtrCountryCard.tsx`: Add `<DependencyIndicator>` (from SPEC-mtr-module)
- `src/lib/api.ts`: Add `getLastPrices()`, `getLastWeighting()`, `getLastMtr()` functions
- `src/types/api.ts`: Add `LastStageCompletionEntry` and `LastStageCompletionResponse` types

### New Components
- `src/components/DependencyIndicator.tsx`: Reusable status pill row component
- `src/hooks/usePipelineDeps.ts`: Hook using `useQueries` to fetch and compute dependency status
- `src/lib/pipeline-deps.ts`: Dependency chain configuration (PIPELINE_ORDER, STAGE_DEPENDENCIES, STAGE_LABELS, STAGE_FETCHERS)
- `src/__tests__/DependencyIndicator.test.tsx`: Unit tests for the indicator component
- `src/__tests__/usePipelineDeps.test.tsx`: Unit tests for the hook

## Edge Cases & Constraints

1. **Country not in last-completion response**: If a country has never run a stage, its key won't exist in the response map. Treat as `not_run`.
2. **Period mismatch**: The upstream stage may have completed for a different period than the one selected. The hook does NOT filter by period -- it shows the latest completion with its date, and the specialist decides if it's recent enough. This is a deliberate v1 simplification.
3. **Multiple endpoints fail**: If all dependency endpoints fail, all dependencies show `unknown`. The trigger button should still be usable (soft gate only adds a warning, never blocks).
4. **Race condition with running jobs**: Since v1 doesn't show `running` status (DD-01), this is not a concern. The 60s staleTime ensures completed runs are detected within a minute.
5. **Circular dependency prevention**: The `STAGE_DEPENDENCIES` config is a DAG with only direct upstream references. Adding a new stage requires adding one entry to `STAGE_DEPENDENCIES`, `STAGE_LABELS`, and `STAGE_FETCHERS`.
6. **Response shape variance**: Sync/calibration endpoints return `job_id`, while prices/weighting/mtr return `run_id`. The `LastStageCompletionEntry` type has both as optional. The hook only reads `completed_at` and `country`, so this variance doesn't affect logic.

## Assumptions

- The mock server endpoints `/metadata/last-prices`, `/metadata/last-weighting`, `/metadata/last-mtr` already exist and return data in `{ countries: Record<string, { country, completed_at, run_id, period }> }` shape (verified in `mock-server/server.js` and `mock-server/stores/run-store.js`).
- Country card components for Prices, Weighting, and MTR will be created by their respective specs before this spec is implemented. The integration into those cards can be done in this spec since the `DependencyIndicator` is a self-contained component passed via props.
- The `PeriodSelector` component provides the period as a `YYYYMM` string, but this feature does not use period for filtering (see Edge Case 2).
- TanStack Query v5 is available, including `useQueries` (verified: `@tanstack/react-query` is in `package.json`).
- Lucide icons `CheckCircle2`, `MinusCircle`, and `HelpCircle` are available (verified: `lucide-react` is a dependency).

## Acceptance Criteria

> These are the "definition of done". Each is verifiable.

1. [x] **AC-01**: Each pipeline module's country cards (except Prices, which has no upstream) show upstream dependency status pills.
2. [x] **AC-02**: Completed dependencies show a green CheckCircle2 icon with stage label, and a tooltip showing the completion date.
3. [x] **AC-03**: Not-run dependencies show a grey MinusCircle icon with stage label.
4. [x] **AC-04**: Unknown status (endpoint unavailable) shows a grey HelpCircle "?" icon -- no console errors, no error toasts.
5. [x] **AC-05**: Trigger button shows a warning tooltip ("Upstream dependencies not met") when any dependency is not `completed`, but the button remains enabled and clickable.
6. [x] **AC-06**: The `usePipelineDeps` hook uses `useQueries` from TanStack Query with `staleTime: 60s`, ensuring at most 1 network request per unique endpoint per 60s window.
7. [x] **AC-07**: Each status pill has an `aria-label` attribute (e.g., `"Precios: completed 2h ago"`) for screen reader accessibility.
8. [x] **AC-08**: Unit tests exist for `DependencyIndicator` component covering all 3 status states (`completed`, `not_run`, `unknown`).
9. [x] **AC-09**: Unit tests exist for `usePipelineDeps` hook covering: all deps met, some deps missing, endpoint failure (unknown fallback).
10. [x] **AC-10**: The `STAGE_DEPENDENCIES` config in `src/lib/pipeline-deps.ts` correctly defines the pipeline DAG: prices(none) -> elegibilidad(prices) -> weighting(elegibilidad) -> calibration(weighting) -> mtr(calibration).
11. [x] **AC-11**: The `DependencyIndicator` renders without overflow on card widths >= 280px with up to 4 pills.

## Dependencies

- **SPEC-prices-module**: Provides `PricesCountryCard.tsx` component. Prices has no upstream dependencies, so no indicator is added to it, but the `/metadata/last-prices` endpoint it provides is consumed by downstream stages.
- **SPEC-weighting-module**: Provides `WeightingCountryCard.tsx` component where the dependency indicator will be integrated. The card must accept the indicator as a child or prop.
- **SPEC-mtr-module**: Provides `MtrCountryCard.tsx` component. Same integration pattern as weighting.
- **Existing endpoints**: `/metadata/last-calibration`, `/metadata/last-elegibilidad` already exist in the backend and mock server.
- **Mock server endpoints**: `/metadata/last-prices`, `/metadata/last-weighting`, `/metadata/last-mtr` already exist in `mock-server/server.js` (lines 35-37).

## Resolved Questions

1. **Should the dependency indicator show the run_id of the upstream completion?** -- No, not in v1. The completion date is sufficient. Run_id linking can be added in a future traceability enhancement (see SPEC-traceability).
2. **Should there be a "refresh dependency status" button?** -- No dedicated button. The 60s staleTime auto-refreshes. Users can navigate away and back to force a re-fetch. A manual refresh button adds UI clutter for minimal value.
3. **Should the indicator show `running`/`failed` upstream states?** -- Not in v1. The last-completion endpoints only return completed runs. See DD-01 for details and the planned future enhancement.
4. **Should transitive dependencies be shown?** -- No. Only direct upstream. See DD-02 for rationale.

## Estimated Effort

- **T-shirt size**: M
- **Suggested breakdown**: 4 tasks across 2 phases
  - Phase 1: Core infrastructure (config, types, API functions, hook, component) + unit tests
  - Phase 2: Integration into Calibration and Eligibility country cards + integration into Prices/Weighting/MTR cards (after their specs are implemented)

## Linear Issues

| Issue | Title | Requirements | Status |
|-------|-------|-------------|--------|
| [JAA-235](https://linear.app/jaalduna/issue/JAA-235/pipeline-deps-config-types-and-api-functions) | Pipeline deps: config, types, and API functions | FR-04, FR-06 | Done |
| [JAA-241](https://linear.app/jaalduna/issue/JAA-241/pipeline-deps-dependencyindicator-component-and-usepipelinedeps-hook) | Pipeline deps: DependencyIndicator component and usePipelineDeps hook | FR-01, FR-02, FR-05, FR-07, FR-08, NFR-01, NFR-02, NFR-03 | Done |
| [JAA-245](https://linear.app/jaalduna/issue/JAA-245/pipeline-deps-integrate-into-calibration-and-eligibility-cards) | Pipeline deps: integrate into Calibration and Eligibility cards | FR-01, FR-03 | Done |
| [JAA-249](https://linear.app/jaalduna/issue/JAA-249/pipeline-deps-unit-tests-for-dependencyindicator-and-usepipelinedeps) | Pipeline deps: unit tests for DependencyIndicator and usePipelineDeps | Testing | Done |

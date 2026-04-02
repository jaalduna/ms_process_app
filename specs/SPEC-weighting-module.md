# Spec: Weighting Module

**Slug**: `weighting-module`
**PRD**: `PRD-ms-process-app`
**PRD Features**: F-02
**Status**: draft
**Priority**: Must-have
**Phase**: Phase 2 — Core Modules
**Depends on**: SPEC-module-registry, SPEC-mock-server
**Created**: 2026-04-02

---

## Problem

Once households are determined to be eligible, a weight (expansion factor) must be assigned to each household so that the sample represents the universe. This weighting process is currently performed manually by the Weighting Specialist using Databricks notebooks. There is no front-end interface to configure parameters, trigger the pipeline, or review weight distributions before they flow into calibration.

## Requirements

### Functional

1. **R-01**: Display a country-card grid showing all 9 LATAM countries with their last weighting date and current period.
2. **R-02**: Allow the Weighting Specialist to select a country and period (YYYYMM) and configure weighting parameters before triggering.
3. **R-03**: Trigger the weighting pipeline for the selected country and period.
4. **R-04**: Show real-time step-based progress of the weighting pipeline.
5. **R-05**: Display weight distribution results — summary statistics (min, max, mean, median, std dev), distribution histogram data, and per-stratum breakdowns — in a results view.
6. **R-06**: Support cancellation of a running weighting pipeline.
7. **R-07**: Show weighting history per country with status, period, and completion dates.
8. **R-08**: Allow downloading weighting results as CSV.
9. **R-09**: Show error details and support retry when a weighting run fails (US-11).

### Non-Functional

1. **NF-01**: Pipeline progress polling at most every 3 seconds.
2. **NF-02**: Follow established country-card grid pattern.
3. **NF-03**: Register via `ModuleDefinition` plugin system.

## Scope

### In Scope
- `src/modules/pesaje/` directory with pages, components, hooks, types
- Module registration via `ModuleDefinition`
- Country card grid page with period selector
- Weighting parameter configuration dialog
- Pipeline trigger and real-time progress
- Weight distribution results view
- Weighting history modal
- CSV download
- API client functions

### Out of Scope
- Backend pipeline implementation
- Weight calculation algorithm
- Data availability checks for eligibility completion (deferred to SPEC-pipeline-deps)

## User Stories Covered

- **US-03**: Configure weighting parameters and trigger weight calculation
- **US-04**: Review weight distributions and summary statistics
- **US-10**: Real-time progress feedback
- **US-11**: Error details and retry

## Design

### Module Definition

```typescript
// src/modules/pesaje/index.ts
export const pesajeModule: ModuleDefinition = {
  id: "weighting",
  label: "Pesaje",
  group: "pipeline",
  navItems: [{ path: "/pesaje", label: "Pesaje" }],
  routes: [{ path: "/pesaje", component: lazy(() => import("./pages/PesajePage")) }],
}
```

### Key Components

| Component | Description |
|-----------|-------------|
| `PesajePage` | Main page: period selector + country card grid |
| `WeightingCountryCard` | Per-country card with status, trigger, progress |
| `WeightingConfigDialog` | Parameter configuration dialog |
| `WeightingDetailModal` | Run detail with weight distribution results |
| `WeightingProgress` | Step-based pipeline visualization |
| `WeightingHistoryModal` | Past runs list with CSV download |

### Types

```typescript
// src/modules/pesaje/types.ts
export type WeightingStepName = "load_eligible" | "calculate_weights" | "validate_distributions" | "export_results" | "complete"

export type WeightingStatus = "pending" | "running" | "completed" | "failed" | "cancelled"

export interface WeightingRun {
  run_id: string
  country: string
  period: number
  status: WeightingStatus
  parameters_json?: Record<string, unknown>
  summary_stats?: WeightingSummary
  steps?: WeightingStep[]
  current_step?: string
  started_at?: string
  completed_at?: string
  created_by?: string
  created_at: string
  updated_at: string
  error_message?: string
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
```

## Files to Create

| File | Purpose |
|------|---------|
| `src/modules/pesaje/index.ts` | Module definition |
| `src/modules/pesaje/types.ts` | TypeScript interfaces |
| `src/modules/pesaje/pages/PesajePage.tsx` | Main page |
| `src/modules/pesaje/components/WeightingCountryCard.tsx` | Country card |
| `src/modules/pesaje/components/WeightingConfigDialog.tsx` | Parameter config |
| `src/modules/pesaje/components/WeightingDetailModal.tsx` | Run detail modal |
| `src/modules/pesaje/components/WeightingProgress.tsx` | Pipeline progress |
| `src/modules/pesaje/components/WeightingHistoryModal.tsx` | History modal |
| `src/modules/pesaje/hooks/useWeighting.ts` | Trigger, poll, cancel hook |
| `src/modules/pesaje/hooks/useLastWeighting.ts` | Last weighting date hook |
| `src/lib/api.ts` | Add weighting API functions |

## Acceptance Criteria

1. Weighting module appears in navigation when `modules.weighting` is `true`.
2. Country cards render for all 9 countries with last weighting date.
3. Configuration dialog allows setting weighting parameters before trigger.
4. Triggering creates a run and shows step-by-step progress.
5. Results display summary statistics (min, max, mean, median, std dev, total households).
6. Cancel stops a running pipeline.
7. History modal shows past runs with CSV download.
8. Errors display with retry capability.

## Open Questions

1. What are the exact pipeline steps for weighting? (Using placeholder steps)
2. What configurable parameters does the weighting pipeline accept?
3. Should the results view include a histogram visualization of weight distributions, or is a summary table sufficient?

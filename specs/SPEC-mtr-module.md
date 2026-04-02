# Spec: MTR Module

**Slug**: `mtr-module`
**PRD**: `PRD-ms-process-app`
**PRD Features**: F-03
**Status**: draft
**Priority**: Must-have
**Phase**: Phase 2 — Core Modules
**Depends on**: SPEC-module-registry, SPEC-mock-server
**Created**: 2026-04-02

---

## Problem

The MTR (deeper calibration targets and imputations) stage is the final step in the Measurement Science pipeline. It generates deeper calibration targets and computes the imputations required to achieve those targets. Currently performed manually by the MTR Specialist via Databricks notebooks, there is no front-end interface to configure parameters, trigger the pipeline, or review imputation results before they are finalized.

## Requirements

### Functional

1. **R-01**: Display a country-card grid showing all 9 LATAM countries with their last MTR date and current period.
2. **R-02**: Allow the MTR Specialist to select a country and period (YYYYMM) and configure MTR parameters before triggering.
3. **R-03**: Trigger the MTR pipeline for the selected country and period.
4. **R-04**: Show real-time step-based progress of the MTR pipeline.
5. **R-05**: Display imputation results — target metrics, imputation counts, and quality indicators — in a results view.
6. **R-06**: Support cancellation of a running MTR pipeline.
7. **R-07**: Show MTR history per country with status, period, and completion dates.
8. **R-08**: Allow downloading MTR results as CSV.
9. **R-09**: Show error details and support retry when an MTR run fails (US-11).

### Non-Functional

1. **NF-01**: Pipeline progress polling at most every 3 seconds.
2. **NF-02**: Follow established country-card grid pattern.
3. **NF-03**: Register via `ModuleDefinition` plugin system.

## Scope

### In Scope
- `src/modules/mtr/` directory with pages, components, hooks, types
- Module registration via `ModuleDefinition`
- Country card grid page with period selector
- MTR parameter configuration dialog
- Pipeline trigger and real-time progress
- Imputation results view
- MTR history modal
- CSV download
- API client functions

### Out of Scope
- Backend pipeline implementation
- Imputation algorithm logic
- Dependency checks on upstream calibration completion (deferred to SPEC-pipeline-deps)

## User Stories Covered

- **US-05**: Trigger the MTR pipeline for a country and period
- **US-06**: Review imputation results and target metrics
- **US-10**: Real-time progress feedback
- **US-11**: Error details and retry

## Design

### Module Definition

```typescript
// src/modules/mtr/index.ts
export const mtrModule: ModuleDefinition = {
  id: "mtr",
  label: "MTR",
  group: "pipeline",
  navItems: [{ path: "/mtr", label: "MTR" }],
  routes: [{ path: "/mtr", component: lazy(() => import("./pages/MtrPage")) }],
}
```

### Key Components

| Component | Description |
|-----------|-------------|
| `MtrPage` | Main page: period selector + country card grid |
| `MtrCountryCard` | Per-country card with status, trigger, progress |
| `MtrConfigDialog` | Parameter configuration dialog |
| `MtrDetailModal` | Run detail with imputation results |
| `MtrProgress` | Step-based pipeline visualization |
| `MtrHistoryModal` | Past runs list with CSV download |

### Types

```typescript
// src/modules/mtr/types.ts
export type MtrStepName = "generate_targets" | "compute_imputations" | "validate_results" | "export_results" | "complete"

export type MtrStatus = "pending" | "running" | "completed" | "failed" | "cancelled"

export interface MtrRun {
  run_id: string
  country: string
  period: number
  status: MtrStatus
  parameters_json?: Record<string, unknown>
  results_summary?: MtrResultsSummary
  steps?: MtrStep[]
  current_step?: string
  started_at?: string
  completed_at?: string
  created_by?: string
  created_at: string
  updated_at: string
  error_message?: string
}

export interface MtrResultsSummary {
  total_targets: number
  targets_achieved: number
  total_imputations: number
  quality_score?: number
}
```

## Files to Create

| File | Purpose |
|------|---------|
| `src/modules/mtr/index.ts` | Module definition |
| `src/modules/mtr/types.ts` | TypeScript interfaces |
| `src/modules/mtr/pages/MtrPage.tsx` | Main page |
| `src/modules/mtr/components/MtrCountryCard.tsx` | Country card |
| `src/modules/mtr/components/MtrConfigDialog.tsx` | Parameter config |
| `src/modules/mtr/components/MtrDetailModal.tsx` | Run detail modal |
| `src/modules/mtr/components/MtrProgress.tsx` | Pipeline progress |
| `src/modules/mtr/components/MtrHistoryModal.tsx` | History modal |
| `src/modules/mtr/hooks/useMtr.ts` | Trigger, poll, cancel hook |
| `src/modules/mtr/hooks/useLastMtr.ts` | Last MTR date hook |
| `src/lib/api.ts` | Add MTR API functions |

## Acceptance Criteria

1. MTR module appears in navigation when `modules.mtr` is `true`.
2. Country cards render for all 9 countries with last MTR date.
3. Configuration dialog allows setting MTR parameters before trigger.
4. Triggering creates a run and shows step-by-step progress.
5. Results display imputation summary (targets, imputations count, quality).
6. Cancel stops a running pipeline.
7. History modal shows past runs with CSV download.
8. Errors display with retry capability.

## Open Questions

1. What are the exact pipeline steps for MTR? (Using placeholder steps)
2. What configurable parameters does the MTR pipeline accept?
3. What quality metrics should be displayed for imputation results?
4. Does MTR need an approval workflow, or is completion sufficient?

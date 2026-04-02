# Spec: Prices Module

**Slug**: `prices-module`
**PRD**: `PRD-ms-process-app`
**PRD Features**: F-01
**Status**: draft
**Priority**: Must-have
**Phase**: Phase 2 — Core Modules
**Depends on**: SPEC-module-registry, SPEC-mock-server
**Created**: 2026-04-02

---

## Problem

Price validation — checking that prices declared in household purchases are aligned with historical product prices and detecting/cleaning outliers — is currently performed manually by the Prices Specialist using ad-hoc scripts and Databricks notebooks. There is no front-end interface to trigger validation, review flagged outliers, or approve cleaned data. This increases cycle time and risk of human error.

## Requirements

### Functional

1. **R-01**: Display a country-card grid showing all 9 LATAM countries with their last price validation date and current period.
2. **R-02**: Allow the Prices Specialist to select a country and period (YYYYMM) and trigger a price validation pipeline.
3. **R-03**: Show real-time step-based progress of the validation pipeline (e.g., load data -> detect outliers -> flag results -> generate report).
4. **R-04**: Display outlier results — flagged products/prices with reasons for flagging — in a sortable, filterable data table.
5. **R-05**: Allow the specialist to approve cleaned data, sending the approval to the backend.
6. **R-06**: Support cancellation of a running validation.
7. **R-07**: Show validation history per country with status, period, and completion dates.
8. **R-08**: Allow downloading validation results as CSV.
9. **R-09**: Show error details and support retry when a validation fails (US-11).

### Non-Functional

1. **NF-01**: Pipeline progress must poll at most every 3 seconds to avoid backend overload.
2. **NF-02**: The module must follow the established country-card grid pattern from Calibration/Eligibility.
3. **NF-03**: The module must register via `ModuleDefinition` and integrate with the dynamic module registry.

## Scope

### In Scope
- `src/modules/precios/` directory with pages, components, hooks, types
- Module registration via `ModuleDefinition`
- Country card grid page with period selector
- Price validation trigger and real-time progress
- Outlier review table with approve/reject actions
- Validation history modal
- CSV download of results
- API client functions in `src/lib/api.ts`

### Out of Scope
- Backend pipeline implementation
- Outlier detection algorithm logic
- Upload of corrected price data (deferred — see Open Question #7 in PRD)

## User Stories Covered

- **US-01**: Trigger price validation for a specific country and period
- **US-02**: Review flagged price outliers and approve/reject corrections
- **US-10**: Real-time progress feedback
- **US-11**: Error details and retry

## Design

### Module Definition

```typescript
// src/modules/precios/index.ts
export const preciosModule: ModuleDefinition = {
  id: "prices",
  label: "Precios",
  group: "pipeline",
  navItems: [{ path: "/precios", label: "Precios" }],
  routes: [{ path: "/precios", component: lazy(() => import("./pages/PreciosPage")) }],
}
```

### Page Layout

Follows the same pattern as `CalibrationPage.tsx`:
- Period selector at top
- Country card grid (3 columns)
- Each card shows: country name, last validation date, data availability badge, trigger/cancel button, progress indicator
- Click card to open detail modal with outlier results table

### Key Components

| Component | Description |
|-----------|-------------|
| `PreciosPage` | Main page: period selector + country card grid |
| `PricesCountryCard` | Per-country card with status, trigger, progress |
| `PricesDetailModal` | Run detail with outlier results table and approve action |
| `PricesProgress` | Step-based pipeline visualization |
| `PricesHistoryModal` | Past validations list with CSV download |
| `PricesConfigDialog` | Parameter configuration (outlier threshold, lookback window) — if applicable |

### Types

```typescript
// src/modules/precios/types.ts
export type PricesStepName = "load_data" | "detect_outliers" | "generate_report" | "complete"

export type PricesStatus = "pending" | "running" | "results_ready" | "approved" | "failed" | "cancelled"

export interface PricesRun {
  run_id: string
  country: string
  period: number
  status: PricesStatus
  parameters_json?: Record<string, unknown>
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
```

## Files to Create

| File | Purpose |
|------|---------|
| `src/modules/precios/index.ts` | Module definition |
| `src/modules/precios/types.ts` | TypeScript interfaces |
| `src/modules/precios/pages/PreciosPage.tsx` | Main page |
| `src/modules/precios/components/PricesCountryCard.tsx` | Country card |
| `src/modules/precios/components/PricesDetailModal.tsx` | Run detail modal |
| `src/modules/precios/components/PricesProgress.tsx` | Pipeline progress |
| `src/modules/precios/components/PricesHistoryModal.tsx` | History modal |
| `src/modules/precios/hooks/usePrices.ts` | Trigger, poll, cancel hook |
| `src/modules/precios/hooks/useLastPrices.ts` | Last validation date hook |
| `src/lib/api.ts` | Add prices API functions |

## Acceptance Criteria

1. Prices module appears in navigation when `modules.prices` is `true` in config.
2. Country cards render for all 9 countries with correct status.
3. Triggering validation creates a run and shows step-by-step progress.
4. Outlier results display in a sortable table with product, price, and reason columns.
5. Approve action sends approval to backend and updates run status.
6. Cancel stops a running validation.
7. History modal shows past runs with CSV download.
8. Errors display with retry capability.

## Open Questions

1. What are the exact pipeline steps for price validation? (Using placeholder steps: load_data, detect_outliers, generate_report, complete)
2. What parameters does the prices pipeline accept? (e.g., outlier threshold percentage, lookback months, product categories)
3. Does the outlier review need individual product-level approve/reject, or is it all-or-nothing?

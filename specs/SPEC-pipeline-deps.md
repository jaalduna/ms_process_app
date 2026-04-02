# Spec: Pipeline Dependency Awareness

**Slug**: `pipeline-deps`
**PRD**: `PRD-ms-process-app`
**PRD Features**: F-05
**Status**: draft
**Priority**: Should-have
**Phase**: Phase 4 — Cross-cutting
**Depends on**: SPEC-prices-module, SPEC-weighting-module, SPEC-mtr-module
**Created**: 2026-04-02

---

## Problem

The Measurement Science pipeline is sequential: Prices -> Eligibility -> Weighting -> Calibration -> MTR. Each stage depends on the successful completion of the upstream stage for the same country and period. Currently, specialists have no visibility into whether upstream stages have completed before triggering their own, leading to wasted runs (triggering with stale or missing input data) and manual coordination via chat/email.

## Requirements

### Functional

1. **R-01**: Each pipeline module's country card must display the completion status of its upstream dependencies for the selected period.
2. **R-02**: Dependency status must show: completed (with date), not yet run, running, or failed — for each upstream stage.
3. **R-03**: If upstream dependencies are not met, the trigger button must show a warning but still allow the specialist to proceed (soft gate, not hard block).
4. **R-04**: Dependency data must be fetched from existing metadata endpoints (`/metadata/last-sync`, `/metadata/last-calibration`, `/metadata/last-elegibilidad`) and new endpoints for Prices, Weighting, and MTR.
5. **R-05**: If dependency data is unavailable (backend endpoint not ready), show "Unknown" status with a neutral indicator — no broken UI.
6. **R-06**: The dependency chain must be configurable per stage:
   - Prices: depends on sync data availability (automatic, every 2h)
   - Eligibility: depends on Prices
   - Weighting: depends on Eligibility
   - Calibration: depends on Weighting (and existing `DataAvailability` checks for elegibilidad + pesaje)
   - MTR: depends on Calibration

### Non-Functional

1. **NF-01**: Dependency status must not add more than 1 additional API call per module page load.
2. **NF-02**: Dependency data must be cached for the duration of the page session (staleTime: 60s).

## Scope

### In Scope
- Upstream dependency indicator component (reusable across all pipeline modules)
- Integration into existing Calibration and Eligibility country cards
- Integration into new Prices, Weighting, and MTR country cards
- Soft-gate UX (warning, not blocking)
- Graceful degradation for unavailable dependency data
- New metadata endpoints in mock server for last-prices, last-weighting, last-mtr

### Out of Scope
- Hard-blocking triggers based on dependency status
- Automatic triggering of downstream stages when upstream completes
- Cross-country dependency visualization

## Design

### Dependency Indicator Component

```typescript
// src/components/DependencyIndicator.tsx
interface DependencyStatus {
  stage: string
  label: string
  status: "completed" | "running" | "not_run" | "failed" | "unknown"
  completed_at?: string
}

interface DependencyIndicatorProps {
  dependencies: DependencyStatus[]
  onTriggerAnyway?: () => void
}
```

Visual design: A compact row of status pills below each country card's header:

```
┌──────────────────────────────┐
│  Chile                       │
│  [✓ Precios] [✓ Elegib.] [⏳ Pesaje] │
│  ⚠ Upstream stage running    │
│  ...                         │
└──────────────────────────────┘
```

### Dependency Configuration

```typescript
// src/lib/pipeline-deps.ts
export const PIPELINE_ORDER = ["prices", "elegibilidad", "weighting", "calibration", "mtr"] as const

export const STAGE_DEPENDENCIES: Record<string, string[]> = {
  prices: [],                          // sync is automatic
  elegibilidad: ["prices"],
  weighting: ["elegibilidad"],
  calibration: ["weighting"],
  mtr: ["calibration"],
}
```

### Hook

```typescript
// src/hooks/usePipelineDeps.ts
function usePipelineDeps(stage: string, country: string, period: string): {
  dependencies: DependencyStatus[]
  allMet: boolean
  loading: boolean
}
```

## Files to Create / Modify

| File | Change |
|------|--------|
| `src/components/DependencyIndicator.tsx` | New shared component |
| `src/hooks/usePipelineDeps.ts` | New hook to fetch and compute dependency status |
| `src/lib/pipeline-deps.ts` | New dependency configuration |
| `src/lib/api.ts` | Add `getLastPrices()`, `getLastWeighting()`, `getLastMtr()` |
| `src/modules/precios/components/PricesCountryCard.tsx` | Add dependency indicator |
| `src/modules/elegibilidad/components/EligibilityCountryCard.tsx` | Add dependency indicator |
| `src/modules/pesaje/components/WeightingCountryCard.tsx` | Add dependency indicator |
| `src/modules/calibracion/components/CountryCard.tsx` | Add dependency indicator |
| `src/modules/mtr/components/MtrCountryCard.tsx` | Add dependency indicator |
| `mock-server/server.js` | Add `/metadata/last-prices`, `/metadata/last-weighting`, `/metadata/last-mtr` |

## Acceptance Criteria

1. Each pipeline module's country cards show upstream dependency status for the selected period.
2. Completed dependencies show a green check with completion date.
3. Missing/not-run dependencies show a neutral indicator.
4. Running dependencies show an animated indicator.
5. Failed dependencies show a red indicator.
6. Unknown status (endpoint unavailable) shows a grey "?" indicator — no errors.
7. Trigger button shows a warning tooltip when dependencies are not met but remains clickable.
8. Dependency checks add at most 1 API call per page load (batch endpoint or cached).

## Open Questions

1. Should the dependency indicator also show the run_id of the upstream completion (for traceability linking)?
2. Should there be a "refresh dependency status" button, or is automatic polling sufficient?

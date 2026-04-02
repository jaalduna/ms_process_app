# Spec: Traceability Module + Tag Integration

**Slug**: `traceability`
**PRD**: `PRD-ms-process-app`
**PRD Features**: F-04, F-06
**Status**: draft
**Priority**: Must-have
**Phase**: Phase 3 — Traceability
**Depends on**: SPEC-module-registry, SPEC-mock-server
**Created**: 2026-04-02

---

## Problem

Each time a specialist runs a pipeline stage for a country, the output tables are produced in Databricks Unity Catalog. However, there is no systematic way to tag these outputs, browse historical runs, or download data from a specific point in time. Analysts who need to compare data across periods or pipeline runs must manually locate tables in Databricks — a slow, error-prone process that limits the depth of analysis.

## Requirements

### Functional

1. **R-01**: Display a searchable, filterable list of tagged pipeline runs.
2. **R-02**: Filter tags by country, period (YYYYMM), stage (Prices, Eligibility, Weighting, Calibration, MTR), and date range.
3. **R-03**: Show tag detail view with: run metadata (who triggered it, when, status), list of associated tables, and table row counts.
4. **R-04**: Allow downloading individual tagged tables as CSV.
5. **R-05**: Allow downloading all tables from a tagged run as a single ZIP archive (if supported by backend).
6. **R-06**: Support pagination for large numbers of tags (100+ per country).
7. **R-07**: Display a timeline or chronological view of tags for a given country, showing which stages were run and when.
8. **R-08**: Define the API contract for tag registration (what the backend must implement when a pipeline run completes).
9. **R-09**: Implement tag browsing and display in the mock server for development.

### Non-Functional

1. **NF-01**: Tag list must load within 2 seconds for up to 500 tags.
2. **NF-02**: CSV download must stream directly from backend (no frontend buffering of large files).
3. **NF-03**: Register via `ModuleDefinition` plugin system.

## Scope

### In Scope
- `src/modules/trazabilidad/` directory with pages, components, hooks, types
- Module registration via `ModuleDefinition`
- Tag browsing page with filters (country, period, stage, date range)
- Tag detail view with table listing and download
- CSV download per table
- API contract documentation for backend tag registration
- Mock server endpoints for traceability

### Out of Scope
- Backend implementation of automatic tag registration (tracked as dependency)
- Comparison view between two tagged snapshots (future consideration)
- Data preview within the UI (only download, no inline table rendering)

## User Stories Covered

- **US-07**: Browse tagged pipeline runs and download data tables from any historical run
- **US-08**: Filter traceability data by country, period, stage, and run

## Design

### Module Definition

```typescript
// src/modules/trazabilidad/index.ts
export const trazabilidadModule: ModuleDefinition = {
  id: "traceability",
  label: "Trazabilidad",
  group: "analysis",
  navItems: [{ path: "/trazabilidad", label: "Trazabilidad" }],
  routes: [{ path: "/trazabilidad", component: lazy(() => import("./pages/TrazabilidadPage")) }],
}
```

### Page Layout

Unlike pipeline modules (country-card grid), the Traceability module uses a **list + detail** pattern:

```
┌─────────────────────────────────────────────────┐
│  Filters: [Country ▼] [Period ▼] [Stage ▼]     │
│           [Date From] [Date To]  [Search]       │
├─────────────────────────────────────────────────┤
│  Tag List (paginated table)                     │
│  ┌───┬──────────┬────────┬───────┬─────────┐   │
│  │ # │ Country  │ Stage  │Period │ Date    │   │
│  ├───┼──────────┼────────┼───────┼─────────┤   │
│  │ 1 │ Chile    │ Calib. │202603│ Mar 15  │   │
│  │ 2 │ Peru     │ Elig.  │202603│ Mar 14  │   │
│  └───┴──────────┴────────┴───────┴─────────┘   │
│                                                 │
│  [< 1 2 3 ... 10 >]                           │
└─────────────────────────────────────────────────┘
```

Clicking a row opens a detail modal:

```
┌─────────────────────────────────────────────────┐
│  Tag Detail: Chile / Calibración / 202603       │
│  Triggered by: user@kantar.com                  │
│  Started: 2026-03-15 10:30                      │
│  Completed: 2026-03-15 11:45                    │
├─────────────────────────────────────────────────┤
│  Tables:                                        │
│  ┌──────────────────────────────┬───────┬─────┐ │
│  │ Table Name                   │ Rows  │  ⬇  │ │
│  ├──────────────────────────────┼───────┼─────┤ │
│  │ calibration.chile.kpis       │ 1,200 │ CSV │ │
│  │ calibration.chile.penetration│ 450   │ CSV │ │
│  └──────────────────────────────┴───────┴─────┘ │
│                                                 │
│  [Download All as ZIP]                          │
└─────────────────────────────────────────────────┘
```

### Types

```typescript
// src/modules/trazabilidad/types.ts
export interface Tag {
  tag_id: string
  run_id: string
  country: string
  period: number
  stage: string
  triggered_by: string
  started_at: string
  completed_at: string
  status: "completed" | "failed"
  tables_count: number
  created_at: string
}

export interface TagDetail extends Tag {
  tables: TagTable[]
}

export interface TagTable {
  table_name: string
  full_name: string
  catalog: string
  schema_name: string
  row_count: number
  size_bytes?: number
}

export interface TagFilters {
  country?: string
  period?: number
  stage?: string
  date_from?: string
  date_to?: string
}

export interface TagListResponse {
  items: Tag[]
  total: number
  limit: number
  offset: number
}
```

### API Contract for Backend Tag Registration

When a pipeline run completes successfully, the backend must:

1. Create a tag record: `POST /traceability/tags`
   ```json
   {
     "run_id": "uuid",
     "country": "CL",
     "period": 202603,
     "stage": "calibration",
     "triggered_by": "user@kantar.com",
     "tables": [
       { "full_name": "catalog.schema.table", "row_count": 1200 }
     ]
   }
   ```
2. The tag must be immutable once created (no updates, no deletes).

## Files to Create

| File | Purpose |
|------|---------|
| `src/modules/trazabilidad/index.ts` | Module definition |
| `src/modules/trazabilidad/types.ts` | TypeScript interfaces |
| `src/modules/trazabilidad/pages/TrazabilidadPage.tsx` | Main page with filters and tag list |
| `src/modules/trazabilidad/components/TagFilters.tsx` | Filter bar component |
| `src/modules/trazabilidad/components/TagTable.tsx` | Paginated tag list table |
| `src/modules/trazabilidad/components/TagDetailModal.tsx` | Tag detail with table downloads |
| `src/modules/trazabilidad/hooks/useTags.ts` | Fetch, filter, paginate tags |
| `src/modules/trazabilidad/hooks/useTagDetail.ts` | Fetch single tag detail |
| `src/lib/api.ts` | Add traceability API functions |

## Acceptance Criteria

1. Traceability module appears in navigation when `modules.traceability` is `true`.
2. Tag list renders with pagination (50 items per page).
3. All filters (country, period, stage, date range) work correctly and can be combined.
4. Tag detail modal shows run metadata and associated tables.
5. CSV download works for individual tables.
6. Mock server returns realistic tag data for all 9 countries and all pipeline stages.
7. API contract for tag registration is documented in this spec.

## Open Questions

1. Should tags also capture failed runs, or only successful completions?
2. Should the timeline view (R-07) be a separate page or a visualization within the tag list page?
3. What is the expected retention period for tags? Should old tags be archivable?

# SPEC: Traceability Module + Tag Integration

**Slug**: `traceability`
**Status**: implementing
**Created**: 2026-04-02
**Author**: joaquin aldunate
**PRD**: `PRD-ms-process-app`
**PRD Features**: F-04, F-06
**Priority**: Must-have
**Phase**: Phase 3 — Traceability
**Depends on**: SPEC-module-registry (done), SPEC-mock-server (done)

---

## Problem

Each time a specialist runs a pipeline stage for a country, the output tables are produced in Databricks Unity Catalog. However, there is no systematic way to tag these outputs, browse historical runs, or download data from a specific point in time. Analysts who need to compare data across periods or pipeline runs must manually locate tables in Databricks — a slow, error-prone process that limits the depth of analysis.

## Scope

### In Scope
1. `src/modules/trazabilidad/` directory with pages, components, hooks, types
2. Module registration via `ModuleDefinition` (following pattern in `src/modules/calibracion/index.ts`)
3. Tag browsing page with filters (country, period, stage, date range)
4. Tag detail view (modal) with table listing and per-table CSV download
5. ZIP download of all tables from a tagged run (if backend supports it)
6. Full API contract documentation for all traceability endpoints (list, detail, download, creation)
7. Mock server endpoints for traceability (already partially implemented in `mock-server/routes/traceability.js`)

### Out of Scope
- Backend implementation of automatic tag registration (tracked as a dependency for the real backend; mock server already handles it)
- Comparison view between two tagged snapshots (future consideration)
- Data preview within the UI (only download, no inline table rendering)
- Timeline/chronological visualization (deferred to a follow-up spec; see resolved Open Questions)

## Requirements

> Each requirement is numbered, testable, and independent.

### Functional Requirements

1. **FR-01**: Display a filterable, paginated list of tagged pipeline runs.
   - *Rationale*: Users need to quickly find tags among potentially hundreds of entries. Follows the same pagination pattern as `EventListResponse` in `src/types/api.ts`.

2. **FR-02**: Filter tags by country, period (YYYYMM), stage (Prices, Eligibility, Weighting, Calibration, MTR), and date range (from/to). Country dropdown options must come from the existing `useCountries()` hook (`src/hooks/useCountries.ts` -> `GET /metadata/countries`). Stage dropdown options must come from `getStages()` (`GET /metadata/stages`).
   - *Rationale*: Analysts work on one country+period at a time. Combining filters narrows results efficiently. Reusing existing metadata hooks ensures filter options stay in sync with the backend and avoids hardcoded values.

3. **FR-03**: Show tag detail view with: run metadata (who triggered it, when, status), list of associated tables, and table row counts.
   - *Rationale*: Before downloading, analysts need to verify they are looking at the correct run and understand what data is available.

4. **FR-04**: Allow downloading individual tagged tables as CSV via streaming from backend.
   - *Rationale*: Analysts import CSV into Excel/R for ad-hoc analysis. Follows the download pattern in `downloadCSV()` and `downloadEligibilityFile()` in `src/lib/api.ts`.

5. **FR-05**: Allow downloading all tables from a tagged run as a single ZIP archive (if backend supports the endpoint).
   - *Rationale*: Downloading tables one by one is tedious for runs with 3+ tables. ZIP bundles save time.

6. **FR-06**: Support pagination for large numbers of tags (50 items per page, consistent with mock server default).
   - *Rationale*: Some countries may have 100+ tags across periods and stages. Unpaginated lists degrade performance and usability.

7. **FR-07**: Display both completed and failed tags, with clear visual distinction (badge/icon) for failed runs.
   - *Rationale*: Failed runs are useful for debugging. The `Tag` type already includes `status: "completed" | "failed"`. Hiding failures removes context.

8. **FR-08**: Define and document the full API contract (list, detail, download, creation) for traceability endpoints.
   - *Rationale*: The backend team needs a clear contract to implement. The mock server (`mock-server/routes/traceability.js`) already implements these endpoints and serves as reference.

9. **FR-09**: Implement tag browsing and display using the mock server for development. Expand `seedTraceability()` in `mock-server/routes/traceability.js` to cover all 9 countries (currently limited to 5 via `.slice(0, 5)`), all 5 pipeline stages, and 3 periods, producing 135+ seed tags.
   - *Rationale*: The mock server currently seeds only 25 tags (5 countries x 5 stages). Expanding to all 9 countries ensures the country filter can be fully tested during development.

### Non-Functional Requirements

1. **NFR-01**: Tag list must load within 2 seconds for up to 500 tags.
2. **NFR-02**: CSV download must stream directly from backend — the frontend must not buffer the entire file in memory. Use `responseType: "blob"` (same pattern as existing `downloadCSV` in `src/lib/api.ts`).
3. **NFR-03**: Register the module via `ModuleDefinition` plugin system and add to `allModules` array in `src/modules/registry.ts`.

## Data Flow

```
User interacts with filters
        |
        v
TagFilters component --> updates URL query params / local state
        |
        v
useTags hook (react-query) --> GET /traceability/tags?country=CL&period=202603&...
        |
        v
TagTable component <-- { items: Tag[], total, limit, offset }
        |
User clicks a row
        |
        v
useTagDetail hook (react-query) --> GET /traceability/tags/:tagId
        |
        v
TagDetailModal component <-- TagDetail (with tables[])
        |
User clicks "Download CSV"
        |
        v
downloadTagTableCSV() --> GET /traceability/tags/:tagId/tables/:tableName/download
        |                  (responseType: "blob", Content-Disposition header)
        v
Browser triggers file download
```

## User Stories Covered

- **US-07**: Browse tagged pipeline runs and download data tables from any historical run
- **US-08**: Filter traceability data by country, period, stage, and run

## Design

### Module Definition

```typescript
// src/modules/trazabilidad/index.ts
import { lazy } from "react"
import type { ModuleDefinition } from "../types"

export const trazabilidadModule: ModuleDefinition = {
  id: "traceability",
  label: "Trazabilidad",
  // "analysis" group: Traceability is a cross-cutting data inspection tool,
  // not a pipeline stage. It reads outputs from all pipeline modules.
  group: "analysis",
  navItems: [{ path: "/trazabilidad", label: "Trazabilidad" }],
  routes: [
    {
      path: "/trazabilidad",
      component: lazy(() => import("./pages/TrazabilidadPage").then(m => ({ default: m.TrazabilidadPage }))),
    },
  ],
}
```

### Page Layout

Unlike pipeline modules (country-card grid), the Traceability module uses a **list + detail** pattern:

```
+---------------------------------------------------+
|  Filters: [Country v] [Period v] [Stage v]        |
|           [Date From] [Date To]                   |
+---------------------------------------------------+
|  Tag List (paginated table)                       |
|  +---+----------+--------+-------+---------+----+ |
|  | # | Country  | Stage  |Period | Date    | St | |
|  +---+----------+--------+-------+---------+----+ |
|  | 1 | Chile    | Calib. |202603 | Mar 15  | OK | |
|  | 2 | Peru     | Elig.  |202603 | Mar 14  | !! | |
|  +---+----------+--------+-------+---------+----+ |
|                                                   |
|  [< 1 2 3 ... 10 >]                              |
+---------------------------------------------------+
```

Clicking a row opens a detail modal:

```
+---------------------------------------------------+
|  Tag Detail: Chile / Calibracion / 202603         |
|  Triggered by: user@kantar.com                    |
|  Status: completed (green badge)                  |
|  Started: 2026-03-15 10:30                        |
|  Completed: 2026-03-15 11:45                      |
+---------------------------------------------------+
|  Tables:                                          |
|  +------------------------------+-------+-------+ |
|  | Table Name                   | Rows  |       | |
|  +------------------------------+-------+-------+ |
|  | calibration.chile.kpis       | 1,200 |  CSV  | |
|  | calibration.chile.penetration|   450 |  CSV  | |
|  +------------------------------+-------+-------+ |
|                                                   |
|  [Download All as ZIP]                            |
+---------------------------------------------------+
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

### Technical Design: Hook Patterns

The hooks follow the same react-query conventions as `useEligibilityRuns` in `src/modules/elegibilidad/hooks/useEligibility.ts`:

```typescript
// src/modules/trazabilidad/hooks/useTags.ts
export function useTags(filters: TagFilters, page: number = 0) {
  const limit = 50
  const offset = page * limit
  return useQuery({
    queryKey: ["traceability-tags", filters, page],
    queryFn: () => getTags({ ...filters, limit, offset }),
    staleTime: 30_000, // consistent with QueryClient defaults
  })
}

// src/modules/trazabilidad/hooks/useTagDetail.ts
export function useTagDetail(tagId: string | null) {
  return useQuery({
    queryKey: ["traceability-tag", tagId],
    queryFn: () => getTagDetail(tagId!),
    enabled: !!tagId,
  })
}
```

Query key conventions:
- List: `["traceability-tags", filters, page]` — invalidated when filters change
- Detail: `["traceability-tag", tagId]` — cached per tag

### Navigation Threshold Note

The `AuthenticatedLayout` (`src/components/AuthenticatedLayout.tsx`, line 137) renders **flat navigation** when total nav items <= 5, and **grouped dropdowns** when > 5. Currently there are 4 nav items (Sincronizacion, Historial, Elegibilidad, Calibracion). Adding Trazabilidad makes exactly 5 — still flat. Adding any future module (Prices, Weighting, MTR) will trigger grouped mode. QA should verify navigation renders correctly at this threshold.

### API Contract

#### 1. List Tags — `GET /traceability/tags`

Query parameters:

| Param | Type | Description |
|-------|------|-------------|
| `country` | string | Filter by country code (e.g., "CL") |
| `period` | number | Filter by period (e.g., 202603) |
| `stage` | string | Filter by pipeline stage (e.g., "calibration") |
| `date_from` | string (ISO date) | Tags completed on or after this date |
| `date_to` | string (ISO date) | Tags completed on or before this date |
| `limit` | number | Page size (default: 50) |
| `offset` | number | Offset for pagination (default: 0) |

Response: `TagListResponse` (200 OK)
```json
{
  "items": [
    {
      "tag_id": "uuid",
      "run_id": "uuid",
      "country": "CL",
      "period": 202603,
      "stage": "calibration",
      "triggered_by": "user@kantar.com",
      "started_at": "2026-03-15T10:30:00Z",
      "completed_at": "2026-03-15T11:45:00Z",
      "status": "completed",
      "tables_count": 3,
      "created_at": "2026-03-15T10:30:00Z"
    }
  ],
  "total": 120,
  "limit": 50,
  "offset": 0
}
```

Note: List response excludes `tables` array for performance. Use the detail endpoint to get tables.

#### 2. Get Tag Detail — `GET /traceability/tags/:tagId`

Response: `TagDetail` (200 OK) — same as `Tag` but includes `tables: TagTable[]`.

Error: 404 `{ "error": "not_found", "message": "Tag <tagId> not found" }`

#### 3. Download Table CSV — `GET /traceability/tags/:tagId/tables/:tableName/download`

Response: `text/csv` stream with `Content-Disposition: attachment; filename="<country>_<stage>_<table>_<period>.csv"`.

Error: 404 if tag or table not found.

#### 4. Download All Tables as ZIP — `GET /traceability/tags/:tagId/download`

Response: `application/zip` stream with `Content-Disposition: attachment; filename="<country>_<stage>_<period>.zip"`.

Error: 404 if tag not found. 501 if backend does not support ZIP.

Note: Frontend should gracefully handle 501 by hiding the ZIP button or showing a disabled state.

#### 5. Create Tag (Backend Only) — `POST /traceability/tags`

Called by the pipeline backend when a run completes. Not called by the frontend.

Request body:
```json
{
  "run_id": "uuid",
  "country": "CL",
  "period": 202603,
  "stage": "calibration",
  "triggered_by": "user@kantar.com",
  "status": "completed",
  "tables": [
    { "full_name": "catalog.schema.table", "row_count": 1200 }
  ]
}
```

Response: `TagDetail` (201 Created). The tag is immutable once created (no updates, no deletes).

## Files to Create

| File | Purpose |
|------|---------|
| `src/modules/trazabilidad/index.ts` | Module definition (follows `calibracion/index.ts` pattern) |
| `src/modules/trazabilidad/types.ts` | TypeScript interfaces (Tag, TagDetail, TagTable, TagFilters, TagListResponse) |
| `src/modules/trazabilidad/pages/TrazabilidadPage.tsx` | Main page with filters and tag list |
| `src/modules/trazabilidad/components/TagFilters.tsx` | Filter bar component (country, period, stage, date range) |
| `src/modules/trazabilidad/components/TagTable.tsx` | Paginated tag list table |
| `src/modules/trazabilidad/components/TagDetailModal.tsx` | Tag detail modal with table downloads |
| `src/modules/trazabilidad/hooks/useTags.ts` | Fetch, filter, paginate tags (react-query) |
| `src/modules/trazabilidad/hooks/useTagDetail.ts` | Fetch single tag detail (react-query) |

## Files to Modify

| File | Change |
|------|--------|
| `src/modules/registry.ts` | Add `trazabilidadModule` to `allModules` array |
| `src/lib/api.ts` | Add `getTags()`, `getTagDetail()`, `downloadTagTableCSV()`, `downloadTagZip()` functions |

## Edge Cases & Constraints

1. **Empty tag list**: When filters return zero results, display an empty state message ("No tags found matching your filters") instead of a blank table.
2. **Tag with zero tables**: A completed run might produce no output tables (e.g., a no-op run). Display the tag detail but show "No tables produced" in the tables section.
3. **Failed CSV download**: If the download request fails (network error, 404, 500), show a toast error notification. Do not leave the user with a hanging loading state.
4. **ZIP not supported (501)**: If the backend returns 501 for ZIP download, hide or disable the "Download All as ZIP" button. Detect this on first attempt and cache the result.
5. **Large row counts**: Format row counts with locale-aware thousands separators (e.g., 1,200 not 1200).
6. **Concurrent filter changes**: If the user changes filters rapidly, only the most recent request should update the UI. Use react-query's built-in cancellation.
7. **URL state synchronization**: Filters should be reflected in the URL query string so that links can be shared and browser back/forward work correctly.
8. **Loading state**: While tags are being fetched, display skeleton placeholders matching the table layout (consistent with `<Skeleton>` usage in `src/components/ui/skeleton.tsx` and the Suspense fallback in `App.tsx`).

## Assumptions

- The mock server's existing traceability endpoints (`mock-server/routes/traceability.js`) match the intended API contract. Any deviations should be fixed in the mock server during implementation.
- The `useModuleConfig` hook (`src/hooks/useModuleConfig.ts`) already includes `traceability: false` as a default, so the module will be hidden until explicitly enabled.
- The real backend will implement the same API contract as the mock server. The frontend does not need conditional logic for mock vs. real.

## Acceptance Criteria

> These are the "definition of done". Each is verifiable.

1. [ ] **AC-01**: Traceability module appears in the navigation sidebar under the "Analysis" group when `modules.traceability` is `true` in the app config. (FR-01, NFR-03)
2. [ ] **AC-02**: Tag list page renders a paginated table with columns: Country, Stage, Period, Date, Status. Default page size is 50 items. (FR-01, FR-06)
3. [ ] **AC-03**: All five filters (country, period, stage, date_from, date_to) work individually and in combination. Applying a filter re-fetches the list from the API. (FR-02)
4. [ ] **AC-04**: Clicking a tag row opens a detail modal showing: triggered_by, started_at, completed_at, status, and a table of associated tables with row counts. (FR-03)
5. [ ] **AC-05**: Clicking "CSV" on a table row in the detail modal triggers a file download. The downloaded file has the correct filename format `<country>_<stage>_<table>_<period>.csv`. (FR-04)
6. [ ] **AC-06**: "Download All as ZIP" button is visible in the detail modal. If the backend returns 501, the button is disabled with a tooltip. (FR-05)
7. [ ] **AC-07**: Failed tags display with a red/destructive badge; completed tags with a green/success badge. (FR-07)
8. [ ] **AC-08**: Mock server returns realistic tag data: at least 5 countries, all 5 pipeline stages, 3 periods, with 2-3 tables per tag. (FR-09)
9. [ ] **AC-09**: When filters return no results, an empty state message is displayed. (Edge Case 1)
10. [ ] **AC-10**: The module is registered in `src/modules/registry.ts` and the API functions are added to `src/lib/api.ts`. (NFR-03)
11. [ ] **AC-11**: While tags are loading, skeleton placeholders are displayed in the table area. (Edge Case 8)
12. [ ] **AC-12**: Country filter dropdown is populated from `useCountries()` hook and stage filter from `getStages()` — no hardcoded values. (FR-02)

## Dependencies

- **SPEC-module-registry** — Status: **done**. The `ModuleDefinition` type and `allModules` registry already exist in `src/modules/types.ts` and `src/modules/registry.ts`.
- **SPEC-mock-server** — Status: **done**. The mock server already includes traceability routes in `mock-server/routes/traceability.js` and the `TagStore` in `mock-server/stores/tag-store.js`.

## Estimated Effort

- **T-shirt size**: M (Medium)
- **Suggested breakdown**: 4-5 tasks across 2 phases
  - Phase 1: Module scaffolding (module definition, types, API functions, registry hookup) + Tag list page with filters
  - Phase 2: Tag detail modal, CSV download, ZIP download, empty/error states, mock server enhancements

## Open Questions (Resolved)

1. ~~Should tags also capture failed runs, or only successful completions?~~ **Resolved**: Yes, include failed runs. The `Tag.status` field already supports `"completed" | "failed"`. Display them with distinct visual badges (FR-07).
2. ~~Should the timeline view (R-07) be a separate page or a visualization within the tag list page?~~ **Resolved**: Deferred to a follow-up spec. The MVP delivers the list+detail pattern. A timeline visualization can be added later as an enhancement.
3. ~~What is the expected retention period for tags? Should old tags be archivable?~~ **Resolved**: No retention policy for MVP. Tags are immutable and persistent. Archival can be addressed in a future spec if the tag count becomes a performance concern.

## Linear Issues

| Issue | Title | Requirements | Status |
|-------|-------|-------------|--------|
| JAA-240 | Scaffold traceability module: types, API functions, and registry hookup | NFR-03, FR-08 | Backlog |
| JAA-250 | Tag list page with paginated table, filters, and loading/empty states | FR-01, FR-02, FR-06, FR-07 | Backlog |
| JAA-254 | Tag detail modal with table listing, CSV download, and ZIP download | FR-03, FR-04, FR-05 | Backlog |
| JAA-243 | Expand mock server traceability seed to all 9 countries and add failed tags | FR-09, FR-07 | Backlog |

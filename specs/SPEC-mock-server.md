# Spec: Mock Server Extensions

**Slug**: `mock-server`
**PRD**: `PRD-ms-process-app`
**PRD Features**: F-08
**Status**: implementing
**Priority**: Should-have
**Phase**: Phase 1 — Foundation
**Depends on**: SPEC-module-registry
**Created**: 2026-04-02

---

## Problem

The existing mock server (`mock-server/server.js`, 842 lines) only supports Sync, Calibration, and Eligibility endpoints. Front-end development of Prices, Weighting, MTR, and Traceability modules cannot proceed without mock APIs, and the real backend (sql-databricks-bridge) may not be ready in time.

## Scope

### In Scope
- New Express routes for Prices, Weighting, MTR, and Traceability modules
- Realistic mock data fixtures covering all 9 LATAM countries
- Simulated pipeline step progression (time-based status transitions)
- Response body shapes consistent with types defined in module specs
- Hybrid proxy updates for new module paths
- Test state reset endpoint for E2E tests
- Code organization refactor (extract routes into per-module files)

### Out of Scope
- Actual backend implementation
- Database or persistent storage (mock uses in-memory state)
- Authentication or authorization logic (existing mock auth is sufficient)

## Requirements

### Functional Requirements

#### Prices Module Endpoints

1. **FR-01**: `POST /api/v1/prices/runs` must create a new price validation run for a given country and period, returning a `PricesRun` object with status `"pending"`.
   - *Rationale*: Frontend needs to create runs before executing them.
2. **FR-02**: `GET /api/v1/prices/runs` must list price validation runs, filterable by `country`, `period`, and `status` query parameters.
   - *Rationale*: Frontend needs to display run history per country.
3. **FR-03**: `GET /api/v1/prices/runs/:runId` must return a single run with steps, outlier results (flagged products with prices and reasons), and current status.
   - *Rationale*: Frontend needs to render the detail modal with outlier review table.
4. **FR-04**: `POST /api/v1/prices/runs/:runId/execute` must start pipeline simulation for the run, transitioning steps over time (pending -> running -> completed/failed).
   - *Rationale*: Frontend needs to poll for progress during execution.
5. **FR-05**: `POST /api/v1/prices/runs/:runId/approve` must transition the run status to `"approved"`.
   - *Rationale*: Frontend needs to send approval after specialist reviews outliers.
6. **FR-06**: `POST /api/v1/prices/runs/:runId/cancel` must transition a running run to `"cancelled"`.
   - *Rationale*: Frontend needs to support cancellation.

#### Weighting Module Endpoints

7. **FR-07**: `POST /api/v1/weighting/runs` must create a new weighting run with configurable parameters.
   - *Rationale*: Frontend needs to create runs with specialist-configured parameters.
8. **FR-08**: `GET /api/v1/weighting/runs` must list weighting runs, filterable by `country`, `period`, and `status`.
   - *Rationale*: Frontend needs run history.
9. **FR-09**: `GET /api/v1/weighting/runs/:runId` must return a single run with steps and weight distribution summary (min, max, mean, median, std_dev, total_households).
   - *Rationale*: Frontend needs to render the results view.
10. **FR-10**: `POST /api/v1/weighting/runs/:runId/execute` must start pipeline simulation.
    - *Rationale*: Frontend needs progress polling.
11. **FR-11**: `POST /api/v1/weighting/runs/:runId/cancel` must cancel a running run.
    - *Rationale*: Frontend needs cancellation.

#### MTR Module Endpoints

12. **FR-12**: `POST /api/v1/mtr/runs` must create a new MTR run.
    - *Rationale*: Frontend needs to create runs.
13. **FR-13**: `GET /api/v1/mtr/runs` must list MTR runs, filterable by `country`, `period`, and `status`.
    - *Rationale*: Frontend needs run history.
14. **FR-14**: `GET /api/v1/mtr/runs/:runId` must return a single run with steps and imputation results summary (total_targets, targets_achieved, total_imputations).
    - *Rationale*: Frontend needs results rendering.
15. **FR-15**: `POST /api/v1/mtr/runs/:runId/execute` must start pipeline simulation.
    - *Rationale*: Frontend needs progress polling.
16. **FR-16**: `POST /api/v1/mtr/runs/:runId/cancel` must cancel a running run.
    - *Rationale*: Frontend needs cancellation.

#### Traceability Module Endpoints

17. **FR-17**: `GET /api/v1/traceability/tags` must list tags, filterable by `country`, `period`, `stage`, `date_from`, and `date_to` query parameters, with pagination (`limit`, `offset`).
    - *Rationale*: Frontend needs browsable, filterable tag list.
18. **FR-18**: `GET /api/v1/traceability/tags/:tagId` must return tag detail including run metadata and a list of associated tables with row counts.
    - *Rationale*: Frontend needs detail modal with table download links.
19. **FR-19**: `GET /api/v1/traceability/tags/:tagId/tables/:tableName/download` must return CSV data for the requested table.
    - *Rationale*: Frontend needs table download functionality.

#### Last-Completion Metadata Endpoints

20. **FR-20**: `GET /api/v1/metadata/last-prices` must return the last completed prices run date per country.
    - *Rationale*: Country cards need to show last validation date.
21. **FR-21**: `GET /api/v1/metadata/last-weighting` must return the last completed weighting run date per country.
    - *Rationale*: Country cards need to show last weighting date.
22. **FR-22**: `GET /api/v1/metadata/last-mtr` must return the last completed MTR run date per country.
    - *Rationale*: Country cards need to show last MTR date.

#### Cross-Cutting

23. **FR-23**: All pipeline module endpoints (Prices, Weighting, MTR) must simulate step-by-step progression when polled — transitioning steps from `pending` -> `running` -> `completed`/`failed` at ~2 second intervals.
    - *Rationale*: Frontend progress indicators depend on realistic step transitions.
24. **FR-24**: `POST /api/v1/test/reset` must clear all in-memory state and re-seed with default fixtures.
    - *Rationale*: E2E tests need deterministic starting state.
25. **FR-25**: The hybrid proxy (`mock-server/hybrid-proxy.js`) must route new module paths (`/prices/*`, `/weighting/*`, `/mtr/*`, `/traceability/*`) to mock or real backend.
    - *Rationale*: Hybrid mode must support the new modules.

#### Pre-seeded Data

26. **FR-26**: The mock server must pre-seed at least 1 completed run per module (Prices, Weighting, MTR) for the current period, covering all 9 LATAM countries.
    - *Rationale*: Country cards need existing data to display on first load.
27. **FR-27**: The mock server must pre-seed at least 20 traceability tags across multiple countries, stages, and periods.
    - *Rationale*: Traceability module needs browsable data with enough volume for pagination testing.

### Non-Functional Requirements

1. **NFR-01**: Mock data must cover all 9 LATAM countries (argentina, bolivia, brasil, cam, chile, colombia, ecuador, mexico, peru).
   - *Rationale*: All modules render 9 country cards.
2. **NFR-02**: Mock server must remain a development-only dependency — no `mock-server/` code may be imported by `src/`.
   - *Rationale*: Production bundle must not include mock data.
3. **NFR-03**: Mock server startup time must be under 2 seconds.
   - *Rationale*: Fast feedback loop for developers.
4. **NFR-04**: Route files must be extracted into `mock-server/routes/<module>.js` to keep each file under 300 lines.
   - *Rationale*: Current `server.js` is 842 lines; adding 4 modules would exceed 2000 lines without refactoring.

## Data Flow

### Pipeline Module Run Lifecycle (Prices, Weighting, MTR)

```
POST /runs (create)  →  run in "pending" state
POST /runs/:id/execute  →  starts step progression timer
GET  /runs/:id (poll)  →  returns current step states
  ... (steps advance every ~2s) ...
GET  /runs/:id (poll)  →  all steps "completed", run status "completed"
POST /runs/:id/approve (Prices only)  →  run status "approved"
```

### Traceability Tag Query Flow

```
Seeded tags (pre-populated from completed pipeline runs)
  ↓
GET /traceability/tags?country=chile&stage=calibration
  ↓
Returns: paginated list of matching tags
  ↓
GET /traceability/tags/:tagId
  ↓
Returns: tag detail with table list
  ↓
GET /traceability/tags/:tagId/tables/:name/download
  ↓
Returns: CSV data
```

## Technical Design

### Code Organization

Extract module-specific routes into separate files:

```
mock-server/
  server.js             ← main app: Express setup, shared middleware, imports routes
  routes/
    sync.js             ← extracted from current server.js (trigger, events, download)
    calibration.js      ← extracted calibration-specific logic (steps, tasks)
    eligibility.js      ← extracted eligibility endpoints (if any exist)
    prices.js           ← NEW: prices module routes
    weighting.js        ← NEW: weighting module routes
    mtr.js              ← NEW: MTR module routes
    traceability.js     ← NEW: traceability module routes
    metadata.js         ← extracted metadata endpoints
    test.js             ← NEW: test/reset endpoint
  stores/
    run-store.js        ← NEW: shared in-memory run store (generic CRUD + step progression)
    tag-store.js        ← NEW: in-memory tag store with filtering
  fixtures/
    seed.js             ← NEW: pre-seed logic for all modules
  hybrid-proxy.js       ← updated with new module routes
```

### Shared Run Store Pattern

All pipeline modules (Prices, Weighting, MTR) share the same run lifecycle. Extract a generic `RunStore` class:

```javascript
// mock-server/stores/run-store.js
class RunStore {
  constructor(moduleName, steps, resultGenerator) { ... }
  create(country, period, params) { ... }        // → run with "pending" status
  list(filters) { ... }                           // → filtered, paginated list
  get(runId) { ... }                              // → single run detail
  execute(runId) { ... }                           // → starts step progression timer
  cancel(runId) { ... }                            // → cancels running run
  approve(runId) { ... }                           // → approves (Prices only)
  advanceStep(runId) { ... }                       // → advances one step (called by timer)
}
```

Each module instantiates its own `RunStore` with module-specific steps and result generators.

### Affected Components

- `mock-server/server.js`: Refactor to import route files; reduce to ~100 lines (app setup + route mounting)
- `mock-server/hybrid-proxy.js`: Add proxy/mock routing for new module paths

### New Components

| File | Purpose |
|------|---------|
| `mock-server/routes/prices.js` | Prices module Express routes |
| `mock-server/routes/weighting.js` | Weighting module Express routes |
| `mock-server/routes/mtr.js` | MTR module Express routes |
| `mock-server/routes/traceability.js` | Traceability module Express routes |
| `mock-server/routes/metadata.js` | Extracted metadata routes |
| `mock-server/routes/test.js` | Test reset endpoint |
| `mock-server/stores/run-store.js` | Shared run CRUD + step progression |
| `mock-server/stores/tag-store.js` | Tag store with filtering and pagination |
| `mock-server/fixtures/seed.js` | Pre-seed data for all modules |

## API Response Examples

### Pipeline Run (Prices, Weighting, MTR — common shape)

```json
{
  "run_id": "uuid",
  "country": "chile",
  "period": 202603,
  "status": "running",
  "parameters_json": { "outlier_threshold": 2.5 },
  "steps": [
    { "name": "load_data", "status": "completed", "started_at": "...", "completed_at": "...", "error": null },
    { "name": "detect_outliers", "status": "running", "started_at": "...", "completed_at": null, "error": null },
    { "name": "generate_report", "status": "pending", "started_at": null, "completed_at": null, "error": null }
  ],
  "current_step": "detect_outliers",
  "started_at": "...",
  "completed_at": null,
  "created_by": "dev@localhost",
  "created_at": "...",
  "updated_at": "...",
  "error_message": null
}
```

Module-specific extensions:
- **Prices**: adds `outliers_count`, `approved_by`, `approved_at`
- **Weighting**: adds `summary_stats: { total_households, weighted_households, min_weight, max_weight, mean_weight, median_weight, std_dev }`
- **MTR**: adds `results_summary: { total_targets, targets_achieved, total_imputations, quality_score }`

### Traceability Tag

```json
{
  "tag_id": "uuid",
  "run_id": "uuid",
  "country": "chile",
  "period": 202603,
  "stage": "calibration",
  "triggered_by": "dev@localhost",
  "started_at": "...",
  "completed_at": "...",
  "status": "completed",
  "tables_count": 3,
  "created_at": "..."
}
```

### Tag Detail

```json
{
  "tag_id": "uuid",
  "...": "(same fields as above)",
  "tables": [
    { "table_name": "kpis", "full_name": "catalog.schema.kpis", "catalog": "kpi_prd_01", "schema_name": "calibration", "row_count": 1200 },
    { "table_name": "penetration", "full_name": "catalog.schema.penetration", "catalog": "kpi_prd_01", "schema_name": "calibration", "row_count": 450 }
  ]
}
```

### Last-Completion Metadata

```json
{
  "countries": {
    "chile": { "country": "chile", "completed_at": "2026-03-15T10:30:00Z", "run_id": "uuid", "period": 202603 },
    "peru": null
  }
}
```

## Edge Cases & Constraints

1. **Empty filter results**: List endpoints must return `{ items: [], total: 0, limit: 50, offset: 0 }` when no runs/tags match the filters — not an error.
2. **Invalid runId/tagId**: `GET /runs/:runId` and `GET /tags/:tagId` must return 404 with `{ error: "not_found", message: "..." }`.
3. **Duplicate trigger**: Creating a run for the same country/period when one already exists must succeed (create a new run, not error).
4. **Cancel non-running run**: `POST /runs/:runId/cancel` on a `pending`, `completed`, or `failed` run must return 409 Conflict.
5. **Execute already-running**: `POST /runs/:runId/execute` on a run that's already `running` must return 409 Conflict.
6. **Approve non-ready**: `POST /prices/runs/:runId/approve` when status is not `results_ready` must return 409 Conflict.
7. **Large tag volume**: Traceability list must support pagination correctly — `offset` + `limit` must not exceed array bounds.
8. **Step progression after cancel**: Once a run is cancelled, the step progression timer must stop — no further status changes.

## Assumptions

- The mock server runs on port 5000 (same as current).
- All new endpoints use the `/api/v1/` prefix (consistent with existing routes).
- Step progression uses `setInterval` at ~2 second intervals (same pattern as existing calibration simulation).
- Pre-seeded data is regenerated on each server restart (no persistence needed).
- The `POST /api/v1/test/reset` endpoint is only used by E2E tests and does not need authentication.

## Acceptance Criteria

1. [ ] **AC-01**: `mock-server/server.js` starts without errors and serves all existing endpoints (no regression) plus all new module endpoints.
2. [ ] **AC-02**: Prices endpoints (`POST /prices/runs`, `GET /prices/runs`, `GET /prices/runs/:id`, `POST .../execute`, `POST .../approve`, `POST .../cancel`) all return valid JSON matching the response examples.
3. [ ] **AC-03**: Weighting endpoints (`POST /weighting/runs`, `GET /weighting/runs`, `GET /weighting/runs/:id`, `POST .../execute`, `POST .../cancel`) all return valid JSON.
4. [ ] **AC-04**: MTR endpoints (`POST /mtr/runs`, `GET /mtr/runs`, `GET /mtr/runs/:id`, `POST .../execute`, `POST .../cancel`) all return valid JSON.
5. [ ] **AC-05**: Traceability endpoints (`GET /traceability/tags`, `GET /traceability/tags/:id`, `GET .../download`) return valid JSON with pagination support.
6. [ ] **AC-06**: Pipeline runs simulate step progression when polled — at least 3 polls show different step states before completion.
7. [ ] **AC-07**: Filtering by `country`, `period`, and `status` works on all list endpoints, returning only matching results.
8. [ ] **AC-08**: `POST /api/v1/test/reset` clears all in-memory state and re-seeds default fixtures.
9. [ ] **AC-09**: Pre-seeded data covers all 9 countries with at least 1 completed run per pipeline module.
10. [ ] **AC-10**: Pre-seeded traceability tags include at least 20 tags across multiple countries and stages.
11. [ ] **AC-11**: `mock-server/hybrid-proxy.js` routes new module paths correctly (mock or proxy based on config).
12. [ ] **AC-12**: Route files are organized in `mock-server/routes/` with no single file exceeding 300 lines.
13. [ ] **AC-13**: Metadata endpoints `GET /metadata/last-prices`, `GET /metadata/last-weighting`, `GET /metadata/last-mtr` return last completion data per country.

## Dependencies

- **SPEC-module-registry**: Module registry must be implementing/done (provides the module config and types that inform API contracts). Status: implementing.
- **SPEC-prices-module**: Type definitions for `PricesRun`, `PricesStep` (can be built in parallel — mock server uses its own response shapes).
- **SPEC-weighting-module**: Type definitions for `WeightingRun`, `WeightingSummary`.
- **SPEC-mtr-module**: Type definitions for `MtrRun`, `MtrResultsSummary`.
- **SPEC-traceability**: Type definitions for `Tag`, `TagDetail`, `TagTable`.

## Estimated Effort

- **T-shirt size**: L
- **Suggested breakdown**: 5 tasks across 1 phase (one per module + one for shared infrastructure/refactor)

## Linear Issues

| Issue | Title | Requirements | Status |
|-------|-------|-------------|--------|
| JAA-219 | Refactor mock server: extract routes, create shared RunStore, add test/reset | FR-23, FR-24, NFR-04 | Done |
| JAA-220 | Add Prices module mock endpoints with seed data | FR-01–FR-06, FR-20, FR-26 | Done |
| JAA-221 | Add Weighting module mock endpoints with seed data | FR-07–FR-11, FR-21, FR-26 | Done |
| JAA-222 | Add MTR module mock endpoints with seed data | FR-12–FR-16, FR-22, FR-26 | Done |
| JAA-223 | Add Traceability module mock endpoints + update hybrid proxy | FR-17–FR-19, FR-25, FR-27 | Done |

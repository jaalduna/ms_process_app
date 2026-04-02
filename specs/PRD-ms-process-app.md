# PRD: Measurement Science Process Application

**Slug**: `ms-process-app`
**Status**: implementing
**Created**: 2026-04-02
**Author**: jaalduna

---

## Vision

A unified front-end application where every collaborator in the Measurement Science process can trigger, monitor, and manage their respective pipeline stage — Prices, Eligibility, Weighting, Calibration, and MTR — for any of the 9 LATAM countries, with full traceability of data at every point in time.

When complete, the application will replace manual, script-driven workflows with a consistent, role-specific interface that provides real-time progress tracking, approval workflows, configurable parameters, and a traceability module that lets analysts retrieve historical snapshots of data for deeper analysis.

## Problem Statement

The Measurement Science process is a multi-stage pipeline (Prices -> Eligibility -> Weighting -> Calibration -> MTR) that transforms raw household purchase data into calibrated, weighted market metrics across 9 Latin American countries. Today:

1. **Incomplete tooling**: Only 3 of 6 required modules exist (Sync, Eligibility, Calibration). The Prices, Weighting, MTR, and Traceability stages lack front-end support, forcing specialists to rely on ad-hoc scripts and notebooks.
2. **No cross-stage traceability**: When a specialist runs a process for a country, the output tables are not systematically tagged. Analysts cannot easily retrieve data snapshots from specific pipeline runs to compare results over time.
3. **Fragmented collaboration**: Each stage has a dedicated specialist, but there is no shared visibility into the overall pipeline status for a given country and period. Specialists cannot easily see whether upstream stages have completed before triggering their own.
4. **Manual overhead**: Triggering, monitoring, and validating each stage requires manual intervention with Databricks notebooks or SQL scripts, increasing the risk of human error and slowing down the monthly processing cycle.

## Goals & Success Metrics

| Goal | Metric | Target |
|------|--------|--------|
| Complete pipeline coverage | Number of pipeline stages with UI modules | 6/6 (Prices, Eligibility, Weighting, Calibration, MTR, Traceability) |
| Reduce manual intervention | Time spent on manual script execution per monthly cycle | Establish baseline in Phase 1; target 50% reduction by Phase 3 |
| Enable data traceability | Analysts can retrieve tagged historical data snapshots | 100% of pipeline runs tagged and queryable |
| Improve collaboration | Cross-stage visibility (upstream status visible before triggering) | All modules show upstream dependency status |
| Reduce processing errors | Failed pipeline runs due to human error | Establish baseline in Phase 1; target 30% reduction by Phase 3 |

## Target Users

| User Type | Description | Primary Need |
|-----------|-------------|-------------|
| Prices Specialist | Validates and cleans price data against historical product prices | Trigger price outlier detection, review flagged items, approve cleaned data |
| Eligibility Specialist | Manages household eligibility criteria for panel inclusion | Configure eligibility parameters, execute pipeline, approve results, handle MorDom corrections |
| Weighting Specialist | Assigns expansion factors to eligible households | Configure weighting parameters, execute weighting pipeline, review weight distributions |
| Calibration Specialist | Runs calibration simulations to align sample KPIs with market targets | Configure aggregation levels, trigger calibration, review KPI outputs |
| MTR Specialist | Generates deeper calibration targets and computes imputations | Configure MTR parameters, execute imputation pipeline, review targets |
| Analyst | Performs deeper analysis on pipeline outputs across time | Download historical data snapshots via traceability, compare results across periods and runs |

## User Stories

> Format: As a [user type], I want [action] so that [benefit].

1. **US-01**: As a Prices Specialist, I want to trigger price validation for a specific country and period (using data already available in Databricks via automatic sync) so that outlier prices are detected and flagged for review.
2. **US-02**: As a Prices Specialist, I want to review flagged price outliers and approve or reject corrections so that only clean price data flows to downstream stages.
3. **US-03**: As a Weighting Specialist, I want to configure weighting parameters and trigger weight calculation for eligible households so that each household receives an appropriate expansion factor.
4. **US-04**: As a Weighting Specialist, I want to review weight distributions and summary statistics so that I can validate the weighting output before it's used in calibration.
5. **US-05**: As an MTR Specialist, I want to trigger the MTR pipeline for a country and period so that deeper calibration targets are generated and imputations are computed.
6. **US-06**: As an MTR Specialist, I want to review imputation results and target metrics so that I can validate the MTR output before it's finalized.
7. **US-07**: As an Analyst, I want to browse tagged pipeline runs and download data tables from any historical run so that I can compare results across different points in time.
8. **US-08**: As an Analyst, I want to filter traceability data by country, period, stage, and run so that I can quickly find the specific snapshot I need.
9. **US-09**: As any Specialist, I want to see whether upstream pipeline stages have completed for my country and period so that I know my inputs are ready before I trigger my stage.
10. **US-10**: As any Specialist, I want real-time progress feedback when my pipeline is running so that I can monitor execution without checking Databricks directly.
11. **US-11**: As any Specialist, I want to see detailed error information when a pipeline fails and retry the failed stage so that I can recover without re-running the entire pipeline from scratch.

## Proposed Solution

Extend the existing MS Process App — a React + Tauri desktop/web application backed by a FastAPI service (sql-databricks-bridge) — with three new pipeline modules (Prices, Weighting, MTR), a Traceability module, and cross-cutting enhancements for pipeline dependency visibility and navigation scalability.

**Data availability**: Data synchronization from SQL Server to Databricks now runs automatically every 2 hours. The existing Sync module remains available for on-demand sync but is no longer a prerequisite step that specialists must trigger manually. All new pipeline modules (Prices, Weighting, MTR) operate on data already present in Databricks Unity Catalog.

Each new module will follow the established architectural patterns: a country-card grid layout with period selection, configurable parameters, step-based progress tracking, Databricks job orchestration, and result download capabilities. To support this, `App.tsx` will be refactored to use the existing but currently unused `ModuleDefinition` plugin system, enabling dynamic module registration without hardcoded routes.

The Traceability module will leverage a tagging system: each time a specialist runs a process for a country, the output tables are registered in a tag table. The Traceability UI will let analysts browse tags, filter by country/period/stage, and download data from any tagged snapshot.

### Key Capabilities

1. **CAP-01**: Prices module — trigger price validation, review outliers, approve cleaned data per country/period
2. **CAP-02**: Weighting module — configure expansion factors, execute weighting pipeline, review weight distributions per country/period
3. **CAP-03**: MTR module — configure imputation parameters, execute MTR pipeline, review targets and imputations per country/period
4. **CAP-04**: Traceability module — browse tagged pipeline runs, filter by country/period/stage, download historical data snapshots
5. **CAP-05**: Pipeline dependency awareness — each module shows upstream stage completion status before allowing trigger
6. **CAP-06**: Tag registration — backend automatically tags output tables when a pipeline run completes successfully

## Scope

### In Scope
- New front-end modules: Prices, Weighting, MTR, Traceability
- Country-card grid UI pattern (consistent with existing Calibration and Eligibility modules)
- Pipeline dependency status display (upstream stage readiness indicators)
- Tag-based data snapshot registration and retrieval (frontend: display, browse, download; API contract definition and mock server)
- Module toggle support via `window.__APP_CONFIG__.modules` (extended with `prices`, `weighting`, `mtr`, `traceability` keys)
- Refactor `App.tsx` to use the existing `ModuleDefinition` plugin system for dynamic module registration
- Navigation redesign to accommodate 8+ modules
- Desktop (Tauri) and web (GitHub Pages) deployment
- Azure AD authentication for all new modules

### Out of Scope
- Backend (FastAPI sql-databricks-bridge) development — API contracts will be defined but backend implementation is a separate initiative
- Backend-side automatic tag registration on pipeline completion — API contract will be defined, but implementation is a backend dependency
- Databricks job/notebook authoring — the pipelines themselves are managed separately
- Changes to the existing Sync, Eligibility, or Calibration modules (unless required for dependency awareness or module registry refactor)
- Mobile-specific layouts
- Internationalization (i18n) beyond existing Spanish/English patterns
- User role-based access control (RBAC) at the module level — all authenticated users can access all modules

### Future Considerations
- Role-based access control: restrict module access by user role (e.g., Prices Specialist only sees Prices module)
- Pipeline orchestration: automatic triggering of downstream stages when upstream completes
- Notification system: email/Slack alerts when a pipeline stage completes or fails
- Dashboard view: cross-country, cross-stage overview of the entire monthly processing cycle
- Audit log: detailed record of who triggered what and when

## System Context

The MS Process App is the front-end layer in a three-tier architecture:

```
[SQL Server (on-premise)]
        |
        v
[sql-databricks-bridge (FastAPI)] <--- REST API ---> [MS Process App (React/Tauri)]
        |
        v
[Databricks Unity Catalog (cloud)]
        |
        v
[Tag Table (metadata)] <--- queried by ---> [Traceability Module]
```

**Existing components involved:**
- `sql-databricks-bridge` FastAPI backend — must be extended with new API endpoints for Prices, Weighting, MTR, and Traceability
- Databricks Unity Catalog — stores pipeline output tables
- Azure AD — authentication for all users
- GitHub Releases — Tauri desktop auto-update mechanism

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Backend API not ready for new modules | High | Medium | Define API contracts upfront; use mock-server (already exists) for front-end development |
| Inconsistent UX across modules | Medium | Low | Follow established patterns from Calibration and Eligibility modules; reuse shared components |
| Tag table schema not finalized | High | Medium | Collaborate with backend team early to define tagging schema; use mock data initially |
| Pipeline dependency data not available from backend | Medium | Medium | Design graceful degradation — show "unknown" status if upstream data is unavailable |
| Scope creep from specialist-specific requirements | Medium | High | Keep initial modules simple (trigger + monitor + review); defer advanced features to Phase 2 |
| Desktop app update friction for new modules | Low | Low | Tauri auto-updater already handles this; ensure module toggles allow gradual rollout |

## Assumptions

- Data synchronization from SQL Server to Databricks runs automatically every 2 hours; the Sync module is available for on-demand use but is not a manual prerequisite for pipeline stages
- The backend (sql-databricks-bridge) will be extended to support new API endpoints following patterns established by existing Calibration and Eligibility endpoints
- Each pipeline stage produces output tables in Databricks Unity Catalog that can be tagged and retrieved
- The tag table is a metadata table in Databricks that records (run_id, country, period, stage, table_name, tagged_at) for each pipeline output
- Each specialist user has Azure AD credentials and appropriate access to the application
- The existing mock-server can be extended to support new module APIs during front-end development
- Pipeline stages are executed sequentially per country/period (Prices -> Eligibility -> Weighting -> Calibration -> MTR), but different countries can be processed in parallel
- The existing `ModuleDefinition` type system in `src/modules/types.ts` is the intended architecture for module registration, though currently unused by `App.tsx`

## Dependencies

- **sql-databricks-bridge backend**: New API endpoints for Prices, Weighting, MTR triggers and status; Traceability query endpoints
- **Databricks pipelines**: Existing notebooks/jobs for Prices, Weighting, and MTR stages (owned by respective specialists)
- **Tag table schema**: Agreement on the metadata schema for pipeline run tagging
- **Azure AD app registration**: Already configured; no changes expected unless RBAC is added
- **Design system**: shadcn/ui + Tailwind CSS (already in use); no new design dependencies

## Feature Breakdown

> These are candidate features that will each become a separate spec (via `/spec`).

| # | Feature | Priority | Complexity | Spec |
|---|---------|----------|-----------|------|
| F-01 | Prices module — trigger, monitor, review outliers | Must-have | L | `SPEC-prices-module` |
| F-02 | Weighting module — configure, trigger, review weights | Must-have | L | `SPEC-weighting-module` |
| F-03 | MTR module — configure, trigger, review imputations | Must-have | L | `SPEC-mtr-module` |
| F-04 | Traceability module — browse tags, filter, download snapshots | Must-have | XL | `SPEC-traceability` |
| F-05 | Pipeline dependency awareness — upstream status indicators | Should-have | M | `SPEC-pipeline-deps` |
| F-06 | Tag registration integration — frontend: display tags, tag browsing UI, API contract definition, mock server implementation; backend: automatic tagging on run completion (tracked as backend dependency, out of front-end scope) | Must-have | M | `SPEC-traceability` |
| F-07 | Module registry refactor + shared scaffold — refactor App.tsx to use the existing ModuleDefinition plugin system (currently unused), then build reusable patterns for new modules | Must-have | M | `SPEC-module-registry` |
| F-08 | Mock server extensions — mock APIs for all new modules | Should-have | M | `SPEC-mock-server` |
| F-09 | E2E tests for new modules | Should-have | M | `SPEC-e2e-tests` |
| F-10 | Navigation and routing updates — add new modules to layout; extend `useModuleConfig`, `public/config.js`, and Tauri config layer (`lib.rs`) with new module keys: `prices`, `weighting`, `mtr`, `traceability` | Must-have | S | `SPEC-module-registry` |
| F-11 | Navigation redesign — restructure top bar to accommodate 8+ nav items (grouped dropdowns by pipeline phase, sidebar, or tabbed layout) | Should-have | M | `SPEC-module-registry` |

## Timeline & Phases

| Phase | Features | Description |
|-------|----------|-------------|
| Phase 1 — Foundation | F-07, F-10, F-11, F-08 | Module registry refactor, navigation redesign, config system expansion, mock server extensions. Establish baselines for success metrics. |
| Phase 2 — Core Modules | F-01, F-02, F-03 | Implement Prices, Weighting, and MTR modules following the shared scaffold |
| Phase 3 — Traceability | F-04, F-06 | Traceability module with tag browsing, filtering, and data download; frontend tag display and API contract definition |
| Phase 4 — Cross-cutting | F-05, F-09 | Pipeline dependency awareness across all modules; E2E test coverage; error recovery and retry capabilities |

## Open Questions

1. What specific parameters does the Prices validation pipeline accept? (e.g., outlier threshold, lookback window, product categories)
2. What parameters does the Weighting pipeline accept? (e.g., target population data source, stratification variables)
3. What parameters does the MTR pipeline accept? (e.g., imputation method, target granularity)
4. Does the Prices module need an approval workflow similar to Eligibility, or is it purely automated with manual review?
5. What is the exact schema of the tag table? What metadata fields are needed beyond (run_id, country, period, stage, table_name)?
6. Should the Traceability module support data comparison between two tagged snapshots, or just individual snapshot downloads?
7. Are there any stages where the specialist needs to upload corrected data (like MorDom in Eligibility)?
8. What is the expected volume of historical data in the tag table? (affects UI pagination and query performance)
9. What navigation pattern is preferred for 8+ modules? (sidebar, grouped dropdowns by pipeline phase, or tabbed layout)
10. What retry granularity should be supported for failed pipelines? (full re-run only, or resume from failed step)

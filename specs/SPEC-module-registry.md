# Spec: Module Registry Refactor + Navigation Redesign

**Slug**: `module-registry`
**PRD**: `PRD-ms-process-app`
**PRD Features**: F-07, F-10, F-11
**Status**: implementing
**Priority**: Must-have
**Phase**: Phase 1 — Foundation
**Depends on**: (none)
**Created**: 2026-04-02

---

## Problem

The application currently hardcodes all module routes and navigation links in `App.tsx` and `AuthenticatedLayout.tsx`. The `ModuleDefinition` plugin system (`src/modules/types.ts`) exists but is unused — each module's `index.ts` exports a definition that is never imported by the app shell. Adding 4 new modules (Prices, Weighting, MTR, Traceability) to the existing 3 (Sync, Eligibility, Calibration) will result in 8+ nav items that won't fit in the current flat top bar, and further hardcoding will make the codebase brittle.

## Requirements

### Functional

1. **R-01**: `App.tsx` must dynamically render routes from registered `ModuleDefinition` objects instead of hardcoded `<Route>` elements.
2. **R-02**: `AuthenticatedLayout.tsx` must dynamically render navigation items from registered modules instead of hardcoded `<NavLink>` elements.
3. **R-03**: Module registration must be conditional based on `useModuleConfig()` — disabled modules must not render routes or nav items.
4. **R-04**: `useModuleConfig` must support new module keys: `prices`, `weighting`, `mtr`, `traceability` (in addition to existing `sync`, `calibration`, `elegibilidad`).
5. **R-05**: `public/config.js` must include the new module keys with sensible defaults (all `false` until modules are implemented).
6. **R-06**: The Tauri config layer (`src-tauri/src/lib.rs`) must pass through new module keys without changes to the deep-merge logic.
7. **R-07**: Navigation must accommodate 8+ items without horizontal overflow. Proposed approach: grouped navigation by pipeline phase or a collapsible sidebar.
8. **R-08**: The active/current route must remain visually indicated in the new navigation design.
9. **R-09**: Existing module definitions (`syncModule`, `calibracionModule`, `elegibilidadModule`) must be used as-is — the refactor wires them into the app shell, not rewrite them.

### Non-Functional

1. **NF-01**: No change in bundle size beyond navigation component additions.
2. **NF-02**: Lazy-loading of module pages must be preserved (already using `React.lazy` in module definitions).
3. **NF-03**: Navigation must remain accessible (keyboard navigable, screen reader compatible).

## Scope

### In Scope
- Refactor `App.tsx` to consume `ModuleDefinition[]` array for route registration
- Refactor `AuthenticatedLayout.tsx` to render nav from module definitions
- Extend `ModuleConfig` interface and `useModuleConfig` hook with new keys
- Update `public/config.js` with new module entries
- Navigation redesign (layout change from flat top bar to grouped/sidebar)
- Extract shared pipeline components as reusable patterns for Phase 2 modules

### Out of Scope
- Implementing any new module pages (Prices, Weighting, MTR, Traceability)
- Backend API changes
- Role-based access control for module visibility

## Design

### Module Registry

```typescript
// src/modules/registry.ts
import { syncModule } from "./sync"
import { calibracionModule } from "./calibracion"
import { elegibilidadModule } from "./elegibilidad"
import type { ModuleDefinition } from "./types"

export const allModules: ModuleDefinition[] = [
  syncModule,
  calibracionModule,
  elegibilidadModule,
  // New modules added here as they are built
]
```

### App.tsx — Dynamic Routes

```typescript
function AppRoutes() {
  const modules = useModuleConfig()
  const enabledModules = allModules.filter(m => modules[m.id])
  const defaultRoute = enabledModules[0]?.routes[0]?.path ?? "/"

  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route element={<ProtectedRoute><AuthenticatedLayout modules={enabledModules} /></ProtectedRoute>}>
        {enabledModules.flatMap(m => m.routes.map(r => (
          <Route key={r.path} path={r.path} element={<Suspense fallback={<Skeleton />}><r.component /></Suspense>} />
        )))}
        <Route path="*" element={<Navigate to={defaultRoute} replace />} />
      </Route>
    </Routes>
  )
}
```

### Navigation Grouping

Pipeline-phase grouped navigation:

```
[Pipeline]          [Analysis]
 Precios             Trazabilidad
 Elegibilidad
 Pesaje
 Calibración
 MTR

[Data]
 Sincronización
 Historial
```

### Updated ModuleConfig

```typescript
interface ModuleConfig {
  sync: boolean
  calibration: boolean
  elegibilidad: boolean
  prices: boolean
  weighting: boolean
  mtr: boolean
  traceability: boolean
}
```

## Files to Change

| File | Change |
|------|--------|
| `src/App.tsx` | Replace hardcoded routes with dynamic module iteration |
| `src/components/AuthenticatedLayout.tsx` | Replace hardcoded nav links with module-driven navigation |
| `src/hooks/useModuleConfig.ts` | Add new module keys with `false` defaults |
| `src/modules/registry.ts` | New file — central module registry |
| `src/modules/types.ts` | Extend `ModuleDefinition` with optional `group` field for nav grouping |
| `public/config.js` | Add new module keys |
| `src-tauri/src/lib.rs` | No changes expected (deep-merge handles new keys) |

## Acceptance Criteria

1. All existing routes and navigation work identically after refactor (no regression).
2. New module keys appear in `useModuleConfig` and `config.js`.
3. Toggling a module key to `false` in `config.js` hides its routes and nav items.
4. Navigation renders without horizontal overflow when all 7+ modules are enabled.
5. Navigation items are keyboard accessible and have proper ARIA labels.
6. All existing unit tests pass without modification.

## Open Questions

1. Should the navigation be a sidebar (always visible) or a collapsible hamburger menu?
2. Should module groups (Pipeline, Analysis, Data) be hardcoded or configurable?

## Linear Issues

| Issue | Title | Requirements | Status |
|-------|-------|-------------|--------|
| JAA-216 | Create module registry and refactor App.tsx for dynamic routing | R-01, R-03, R-09, NF-02 | Done |
| JAA-217 | Extend useModuleConfig and config.js with new module keys | R-04, R-05, R-06 | Done |
| JAA-218 | Redesign navigation for 8+ modules with grouped layout | R-02, R-07, R-08, NF-01, NF-03 | Done |

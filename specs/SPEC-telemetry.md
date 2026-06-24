# SPEC — Telemetry (errors/crashes + usage analytics)

Ticket: JAA-429 (sub-issue of JAA-426). Repo: `ms_process_app` (frontend). Verified against `mock-server/`.

## Purpose

Two concerns, one client (`src/lib/telemetry.ts`):

1. **Errors / crashes** (diagnostics) — `window.onerror`, `unhandledrejection`, and a React
   `ErrorBoundary` (`src/components/ErrorBoundary.tsx`).
2. **Usage analytics** (adoption + UX) — session duration, pages visited, and the controls users
   interact with most.

## Transport & resilience

- Standalone `fetch` (not the axios `api` instance) so telemetry is decoupled from app request
  interceptors. `session_end` uses `navigator.sendBeacon` so it survives page unload.
- Events are **queued, debounced, and flushed in batches**; the queue is capped (drop-oldest).
- **Telemetry never throws and never blocks the app.** A failed POST is swallowed; the events batch
  is re-queued for a later flush.
- Base URL resolves like `src/lib/api.ts`: `__BRIDGE_CONFIG__.API_URL` → `VITE_BRIDGE_API_URL` →
  `http://localhost:8000/api/v1`.

## Endpoints (mock-server `routes/telemetry.js`)

| Method | Path                       | Response                          |
| ------ | -------------------------- | --------------------------------- |
| POST   | `/api/v1/telemetry/events` | `202 { accepted: true, count }`   |
| POST   | `/api/v1/telemetry/errors` | `202 { accepted: true, count }`   |

Both accept a batch (`{ events: [...] }` / `{ errors: [...] }`) and are best-effort 202s.

## Event payloads

All events carry `sessionId` (per page-load), `appVersion` (`APP_VERSION` build global),
`user` (authenticated email or `null`), and `occurredAt` (ISO).

- `session_start` — emitted on `initTelemetry()`.
- `session_end` — `{ durationMs }`, beaconed on `pagehide`.
- `page_view` — `{ path, dwellMs? }` on every route change (dwell of the previous page).
- `interaction` — `{ name, props? }`. Name comes from `data-telemetry="<name>"` when present, else
  is derived from a clicked `button`/`a`/`[role=button]`'s `aria-label`/text (broad auto-capture).

Error report: `{ message, stack?, kind: "error"|"unhandledrejection"|"react", path, appVersion,
userAgent, occurredAt, sessionId, user }`.

## Privacy — what is captured

Internal tool with authenticated users; **user identity (email) is recorded on purpose** (product
request). Captured: user email, sessionId, appVersion, userAgent, visited route paths + dwell,
interacted control names, and for errors the message/stack/path/timestamp. **Not** captured: form
values, request/response bodies, or any PII beyond the authenticated email.

## Wiring

- `initTelemetry()` in `src/main.tsx` (before first render) installs global listeners + session.
- `ErrorBoundary` wraps the app; `TelemetryRouteListener` (in `App.tsx`, inside Router + Auth)
  syncs the user and emits `page_view` per route.
- `track(name, props?)` is exported for explicit instrumentation; `data-telemetry` is the
  declarative path.

## Feature flag / kill-switch (JAA-558)

Telemetry is gated by `window.__APP_CONFIG__.features.telemetry` (read via
`src/lib/feature-flags.ts`). Default **on** when unset, so mock/dev/tests are unaffected.
When `false`, `initTelemetry()` early-returns — no listeners, no timer, **no network requests**
(so backends without the sink produce no `405`/failed-request console errors). The real-API
deploy configs (`deploy/config.{dev,prod}.js`) set it `false`; flip back to `true` once
`ms-process-api` implements `POST /telemetry/events`. The sibling flag
`features.processStatus` gates the `/processes/status` poller the same way.

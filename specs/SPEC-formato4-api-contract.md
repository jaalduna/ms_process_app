# SPEC: Formato 4 API Contract

**Slug**: `formato4-api-contract`
**PRD**: `PRD-ms-process-app`
**Status**: contract (single source of truth for FE + mock E3 + Bridge API E4)
**Priority**: Must-have
**Phase**: Phase 2 — Core Modules
**Linear**: MTR-26 (parent MTR-17)
**Depends on**: SPEC-mtr-module (lifecycle pattern), SPEC-weighting-module (by-runId download), SPEC-mock-server
**Path contract**: MTR-22 (Volume layout & zip naming, writer side)
**Created**: 2026-06-24

---

## Purpose

This is **the one contract** that three independent implementations code against, so they
stay in lock-step without sharing a runtime:

| Consumer | Repo | Issue family | What it builds |
|----------|------|--------------|----------------|
| Frontend (`useFormato4`, `Formato4*` components) | `ms_process_app` | MTR-29… | Calls these endpoints; reuses the `mtr` UI module verbatim |
| Node mock-server (E3) | `ms_process_app/mock-server/` | E3 | Serves these endpoints in-memory so the FE is buildable + Playwright-testable without a backend |
| Bridge API (E4) | `ms-process-api` | E4 (mirrors MTR `routes/mtr.py`) | Real FastAPI routes that trigger Databricks |

**Design rule: Formato 4 is `mtr` with a different step list and a real zip download.** The
lifecycle (`create → execute → poll → cancel`), the Pydantic shapes, the polling cadence, the
status enum, and the error envelope are **identical to MTR**. The only deltas are:

1. a different **steps model** (`sync → merge → simulate → format_4 → zip`), and
2. a **real server-side download endpoint** returning a **zip** (MTR has no download endpoint;
   it generates CSV client-side). The download mirrors **weighting's by-runId** download, not
   calibration's by-tag download.

Align FE work to the existing `mtr` lifecycle (Bridge API `routes/mtr.py` + frontend `useMtr`)
and the existing `weighting` download (`downloadWeightingCSV` + `GET /weighting/runs/{runId}/download`).

---

## 1. Endpoints

All endpoints are mounted under the API prefix **`/api/v1`** (the FE base URL
`VITE_BRIDGE_API_URL` already includes `/api/v1`, so the FE calls the paths below without the
prefix, exactly as it does for `/mtr`).

| # | Method & path | Purpose |
|---|---------------|---------|
| 1 | `POST /formato4/runs` | Create a run (pre-execution) |
| 2 | `POST /formato4/runs/{runId}/execute` | Trigger the Databricks job |
| 3 | `GET  /formato4/runs/{runId}` | Poll a single run (status + steps + percent + results) |
| 4 | `GET  /formato4/runs?country=&period=` | List runs (last-run card + history modal) |
| 5 | `POST /formato4/runs/{runId}/cancel` | Cancel a running/pending run |
| 6 | `GET  /formato4/runs/{runId}/download` | Download the result zip (by runId) |

> A `GET /metadata/last-formato4?period=YYYYMM` endpoint (mirroring `/metadata/last-mtr`) is
> **out of scope for this contract** — the "last run" card derives its data from endpoint #4
> (`GET /formato4/runs?country=&period=`, newest-first). If a dedicated metadata endpoint is
> later desired it is a separate ticket and must mirror `LastStageMap` from `schemas.py`.

### 1.1 `POST /formato4/runs` — create

Request body (`RunCreate` from `schemas.py`, reused verbatim):

```json
{ "country": "chile", "period": 202601, "parameters": { } }
```

- `country` (string, required), `period` (int `YYYYMM`, required), `parameters` (object, optional).
- **201 Created** → a `Formato4Run` with `status: "pending"`, all steps `pending`,
  `results_summary: null`, `databricks_run_id` unset.

```json
{
  "run_id": "1f0c…-uuid",
  "country": "chile",
  "period": 202601,
  "status": "pending",
  "parameters_json": {},
  "steps": [
    { "name": "sync",     "status": "pending", "started_at": null, "completed_at": null, "error": null },
    { "name": "merge",    "status": "pending", "started_at": null, "completed_at": null, "error": null },
    { "name": "simulate", "status": "pending", "started_at": null, "completed_at": null, "error": null },
    { "name": "format_4", "status": "pending", "started_at": null, "completed_at": null, "error": null },
    { "name": "zip",      "status": "pending", "started_at": null, "completed_at": null, "error": null }
  ],
  "results_summary": null,
  "current_step": null,
  "started_at": null,
  "completed_at": null,
  "created_by": "dev@localhost",
  "created_at": "2026-06-24T17:00:00Z",
  "updated_at": "2026-06-24T17:00:00Z",
  "error_message": null
}
```

- **400** `bad_request` if `country` or `period` missing.
- **422** `validation_error` if `period` is not an integer `YYYYMM`.

### 1.2 `POST /formato4/runs/{runId}/execute` — trigger Databricks

Triggers the Databricks job for `(country, period)`, transitions the run to `running`, starts
step 1 (`sync`), and records the Databricks run id.

- **200 OK** → the `Formato4Run` now with `status: "running"`, `current_step: "sync"`,
  `started_at` set, and **`databricks_run_id`** populated. (`databricks_run_id` is surfaced on
  the run; it is the handle the poll step uses to query the Jobs API — same as `mtr`'s
  `_refresh()`.)
- **409** `conflict` if the run is already `running`, or its status is not `pending`
  (message: `Cannot execute run with status "<status>"`).
- **404** `not_found` if `runId` is unknown (or, on the real API, not owned by the caller's
  countries — RBAC via `assert_country_allowed`).

> **E4 note:** the Databricks job params are `{country, period, run_tag}` where
> `run_tag = "<country>-<period>-<8hex>"`, identical to `routes/mtr.py::execute_run`. The
> `run_tag` is what disambiguates concurrent runs in the Volume (see §4).

### 1.3 `GET /formato4/runs/{runId}` — poll

Returns the current `Formato4Run`. On the real API this **polls Databricks** and maps task
state to steps via `monitor.map_run_to_steps(run, STEPS)` before returning (see §3). On the
mock it returns the in-memory run advanced by its step timer.

Response fields the FE consumes (a `Formato4Run`):

| Field | Type | Notes |
|-------|------|-------|
| `status` | enum | `pending \| running \| completed \| failed \| cancelled` |
| `steps` | `Formato4Step[]` | one per pipeline step, see §2 / §3 |
| `current_step` | string \| null | name of the currently-running step |
| `results_summary` | object \| null | populated only when `completed` (see §2.3) |
| `error_message` | string \| null | populated when `failed`/`cancelled` |
| `created_at` / `updated_at` / `started_at` / `completed_at` | timestamps | |

> **`percent` (the ticket's `percent`) is derived on the FE, not a wire field.** The contract
> step record is `{name, status, started_at, completed_at, error}` (see §2 — verbatim from the
> MTR/weighting step shape in `schemas.py`). The FE computes
> `percent = round(100 * completed_steps / total_steps)` and looks up a human `label` from a
> `FORMATO4_STEP_LABELS` map. This reconciles the ticket's shorthand `steps:[{key,label,state}]`
> with the actual reused shape: `key`→`name`, `state`→`status`, `label`/`percent` are FE-derived.
> Keeping the wire shape identical to MTR is what lets the `mtr` UI module be reused verbatim.

- **404** `not_found` if `runId` is unknown.

### 1.4 `GET /formato4/runs?country=&period=` — list

Query params (all optional): `country`, `period` (int), `status`, `limit` (default 50),
`offset` (default 0). Returns a `Formato4RunList`, newest-first:

```json
{ "items": [ /* Formato4Run[] */ ], "total": 12, "limit": 50, "offset": 0 }
```

This feeds both the per-country "last run" card and the history modal. The FE accesses
`.items` (same as `getMtrRuns`).

### 1.5 `POST /formato4/runs/{runId}/cancel` — cancel

- **200 OK** → the run with `status: "cancelled"`, any `running` step flipped to `failed` with
  `error: "Cancelled by user"`, `error_message: "Cancelled by user"`. On the real API the
  Databricks run is cancelled via `databricks.cancel_run(databricks_run_id)`.
- **409** `conflict` if the run's status is not cancellable (only `pending`/`running` are
  cancellable; message: `Cannot cancel run with status "<status>"`).
- **404** `not_found` if `runId` is unknown.

### 1.6 `GET /formato4/runs/{runId}/download` — download zip (by runId)

Returns the result **zip** for a completed run. **Keyed by `runId`** (mirrors
`GET /weighting/runs/{runId}/download`), NOT by tag (do **not** mirror calibration's
`/calibration/{tag}/download?country=`).

- **200 OK** with a **binary zip stream**:
  - Real API: FastAPI **`StreamingResponse`** streaming the Volume zip bytes.
  - Headers: `Content-Type: application/zip` and
    `Content-Disposition: attachment; filename="format_4_<country>_<period>.csv.zip"`.
- **409** `conflict` if the run's status is not `completed` (message: `Run is not completed`).
- **404** `not_found` if `runId` is unknown (or the zip artifact is missing on the Volume).

FE side: reuse the **`downloadWeightingCSV`** pattern — `responseType: "blob"`, read the
filename from the `Content-Disposition` header (fallback `format_4_<runId8>.csv.zip`), then
`URL.createObjectURL` → anchor click → `revokeObjectURL`. (Name the FE helper
`downloadFormato4Zip(runId)`.)

---

## 2. Steps model & data shapes

### 2.1 Steps (verbatim Databricks `task_key`s)

The pipeline has exactly **5 ordered steps**:

```
sync → merge → simulate → format_4 → zip
```

**The Databricks job's `task_key`s MUST equal these names verbatim.** The poll layer
(`monitor.map_run_to_steps(run, STEPS)`) joins Databricks tasks to contract steps **by
`task_key` == step `name`**; any step with no matching task defaults to `pending`. A
mismatched `task_key` silently shows the step stuck at `pending` forever — so this is a hard
naming constraint shared by MTR-48 / MTR-51 (writer + job yaml) and the E4 route.

Suggested FE label map (display only — not part of the wire contract):

```ts
export const FORMATO4_STEP_LABELS = {
  sync:     "Sincronización",
  merge:    "Merge",
  simulate: "Simulación",
  format_4: "Formato 4",
  zip:      "Empaquetado (zip)",
}
```

### 2.2 Pydantic shapes (reuse `RunCreate` / `RunBase` from `schemas.py`)

Add to `ms-process-api` `schemas.py`, mirroring the MTR block (`MtrStep` / `MtrResultsSummary`
/ `MtrRun` / `MtrRunList`). The request body reuses `RunCreate` **as-is**; the run extends
`RunBase` **as-is** (do not redefine the base fields):

```python
class Formato4Step(BaseModel):
    name: str | None = None
    status: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    error: str | None = None


class Formato4ResultsSummary(BaseModel):
    # Aligns with the Formato 4 CSV produced by the writer (MTR-22 / MTR-51).
    country: str | None = None
    period: int | None = None
    row_count: int | None = None
    generated_at: str | None = None
    sim_wheel_version: str | None = None


class Formato4Run(RunBase):                       # RunBase reused verbatim
    status: str | None = None
    steps: list[Formato4Step] = []
    results_summary: Formato4ResultsSummary | None = None


class Formato4RunList(BaseModel):
    items: list[Formato4Run]
    total: int
    limit: int
    offset: int
```

`RunCreate` (request body for `POST /runs`) and `RunBase` (run fields) are the **existing**
shared shapes from `schemas.py`:

```python
class RunCreate(BaseModel):
    country: str
    period: int
    parameters: dict[str, Any] | None = None

class RunBase(BaseModel):
    run_id: str
    country: str
    period: int
    parameters_json: dict[str, Any] | None = None
    current_step: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime
    error_message: str | None = None
```

The corresponding TypeScript types in `ms_process_app` (`src/modules/formato4/types.ts`) mirror
`MtrRun`/`MtrStep`, swapping the step names and `results_summary` fields. `Formato4RunCreate`
== `{ country: string; period: number; parameters?: Record<string, unknown> }`.

### 2.3 `results_summary` (populated on `completed`)

`results_summary` is `null` until the run completes, then mirrors the `_metadata.json` the
writer emits inside the zip (MTR-22): `{ country, period, row_count, generated_at,
sim_wheel_version }`. The FE must render gracefully when `results_summary` is `null` even on a
`completed` run (same edge case as MTR — show "Resultados no disponibles").

---

## 3. Status & polling

- **Status enum** (identical to MTR/weighting): `pending`, `running`, `completed`, `failed`,
  `cancelled`.
- **Poll while** status ∈ `{pending, running}` (FE `FORMATO4_POLL_STATUSES`); **stop** at a
  terminal status (`completed`/`failed`/`cancelled`). Poll interval ≤ **3000 ms** (matches
  `useMtr`).
- **Real-API mapping:** `GET /runs/{runId}` calls `monitor.map_run_to_steps(databricks_run,
  STEPS)`, which maps Databricks `life_cycle_state`/`result_state` → our status and joins tasks
  → steps by `task_key`. On `completed`, the route reads the result summary from the Volume; on
  `failed`/`cancelled` it sets `completed_at` + `error_message`.

---

## 4. Download artifact path (agrees with MTR-22)

The download endpoint streams the zip the writer (MTR-51) produced to the Volume. The path is
defined by **MTR-22** and is authoritative there; restated here so the reader (this endpoint),
the writer, and the job-yaml mapping (MTR-48) agree:

- **Canonical:** `/Volumes/002-mwp/bronze/files/exports/format_4_<country>.csv.zip`
- **Run-tagged (concurrent-safe):** `/Volumes/002-mwp/bronze/files/exports/format_4_<country>_<period>.csv.zip`

**Contents:** a single `format_4_<country>.csv` (26-col schema) plus an optional
`_metadata.json` (`country, period, row_count, generated_at, sim_wheel_version`) — the latter
feeds `results_summary` (§2.3).

The `download` endpoint resolves the path **from the run record** (the run's `country`/`period`
+ `run_tag` stored at execute time), reads the bytes from the Volume, and streams them. The
client never sees the Volume path — it only sees the `Content-Disposition` filename
`format_4_<country>_<period>.csv.zip`.

---

## 5. Error envelope (mirrors mtr/weighting)

All error responses share the shape from `schemas.py::ApiError`:

```json
{ "error": "<machine_code>", "message": "<human readable>" }
```

| HTTP | `error` | When |
|------|---------|------|
| 400 | `bad_request` | missing `country`/`period` on create |
| 404 | `not_found` | unknown `runId` (or RBAC-denied / missing artifact) |
| 409 | `conflict` | execute a non-`pending` run, cancel a terminal run, download a non-`completed` run |
| 422 | `validation_error` | `period` not an integer `YYYYMM` |

---

## 6. Acceptance / done

This contract is "done" when the doc enumerates, for `/formato4`: the 6 endpoints with
request/response shapes, the verbatim `sync → merge → simulate → format_4 → zip` step model
with the `task_key` constraint, the reused `RunCreate`/`RunBase` + new `Formato4*` shapes, the
by-runId zip `StreamingResponse` download mirroring weighting, the MTR-22 Volume path agreement,
and the status/error model. Downstream tickets (mock E3, FE `useFormato4`, Bridge API E4,
MTR-48 job yaml, MTR-51 writer) each implement their slice **against this document** and are
verified independently.

> **Scope:** this ticket (MTR-26) delivers only this document. No mock-server route, FE module,
> or backend route is implemented here — those are separate tickets that cite this contract.

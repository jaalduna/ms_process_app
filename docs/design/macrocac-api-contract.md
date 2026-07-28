# macrocac API contract (mock-server, JAA-1048)

macrocac applies row-level corrections — an Excel with columns `IdAto`,
`Flg` (`M`=modify / `E`=erase), and optional `New*` columns — on top of
production SQL tables, always in dry-run mode, and produces two Excel
reports (`reporte` and `reporte-diff`).

This document describes the contract the mock-server implements
(`mock-server/routes/macrocac.js`). It is the seam the frontend (JAA-1051 /
JAA-1053) builds against without the real backend, and the contract the real
backend (**JAA-1052**, `ms-process-api`) must implement, replacing the
mock's synthetic validation with real `.xlsx` parsing.

Base path: `/api/v1/macrocac`.

## Vocabularies

- `pais` ∈ `BO, CL, MX, CO, EC, PE`
- `tabla` ∈ `j_atoscompra_new, j_atoscompra_new_test, hato_cabecalho_ooh`

## `POST /macrocac/uploads`

The mock has no multipart/xlsx parser (`express.json()` leaves the upload
body unparsed for `multipart/form-data`). `filename`, `pais`, and `tabla`
travel via query string instead — the same convention as
`eligibility.js`/`weighting-params.js`.

Request:

```
POST /api/v1/macrocac/uploads?filename=<name>&pais=<PAIS>&tabla=<TABLA>
```

Responses:

- `400 {error: "bad_request", message}` — `pais` or `tabla` not in the
  vocabularies above.
- `422 {error: "missing_columns", missing_columns: ["IdAto", "Flg"]}` — magic
  filename: any filename containing `sin-idato` or `invalid` (case
  insensitive) simulates a sheet missing the mandatory `IdAto`/`Flg`
  columns.
- `201` — valid upload, synthesized to match `correcciones_bo.xlsx`:

```json
{
  "upload_id": "upl_macrocac_1",
  "filename": "correcciones_bo.xlsx",
  "pais": "BO",
  "tabla": "j_atoscompra_new",
  "motivo": "Corrección de campos de compra mal capturados en el operativo de campo.",
  "filas": 14,
  "columnas": [
    "IdAto", "Flg", "NewQuantidade", "NewPreco", "NewIdCanal",
    "NewForma_Compra", "NewUnidadesPack", "NewDataCompra",
    "NewIdArtigo", "NewPacksComprados"
  ]
}
```

## `POST /macrocac/runs`

Creates a dry-run execution against a previously uploaded correction file.

Request:

```json
{ "upload_id": "upl_macrocac_1" }
```

Responses:

- `404 {error: "not_found", message}` — unknown `upload_id`.
- `409 {error: "run_in_progress", message, run_id}` — a run is already
  `running` for the same `(pais, tabla)` pair (dedupe rule); `run_id` is the
  existing active run.
- `201` — run created and progression started:

```json
{
  "run_id": "run_macrocac_<uuid>",
  "status": "running",
  "dry_run": true,
  "pais": "BO",
  "tabla": "j_atoscompra_new",
  "upload_id": "upl_macrocac_1",
  "created_at": "2026-07-28T12:00:00.000Z",
  "completed_at": null,
  "resultado_lote": null
}
```

`dry_run` is always `true` — macrocac never writes in this MVP.

## `GET /macrocac/runs`

Lists all runs: `{ items: [...], total }`.

## `GET /macrocac/runs/:runId`

Returns the same shape as the create response. `status` progresses from
`running` to `succeeded` after `MOCK_STEP_INTERVAL_MS` (default 2000ms,
same knob as `qms_tr.js`/`sync.js`). `resultado_lote` stays `null` until
`status === "succeeded"`, then contains 14 entries mirroring
`correcciones_bo.xlsx`:

```json
{
  "resultado_lote": [
    { "IdAto": 900001, "ok": true, "mensaje": "Actualizado correctamente.", "accion": "M" },
    { "IdAto": 900009, "ok": false, "mensaje": "No se encontró IdAto en la tabla destino.", "accion": "M" }
  ]
}
```

Rows alternate `accion` `M`/`E`; exactly one row (`IdAto` 900009) is
synthesized with `ok: false` so the UI has a realistic error case.

`404 {error: "not_found", message}` for an unknown `run_id`.

## `GET /macrocac/runs/:runId/reporte` and `/reporte-diff`

Downloads for the two dry-run reports. The mock has no xlsx writer (mirrors
the `weighting-params.js` `export.xlsx` precedent) — it returns a buffer
stub with the correct headers, not a real workbook.

- `404` — unknown `run_id`.
- `409 {error: "run_not_finished", message}` — run status is not yet
  `succeeded`.
- `200` — `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
  `Content-Disposition: attachment; filename="reporte_<pais_lower>.xlsx"`
  (or `reporte_<pais_lower>_diff.xlsx` for the diff endpoint).

## Notes for the real backend (JAA-1052)

- Replace the query-string `filename`/`pais`/`tabla` shortcut with real
  `multipart/form-data` parsing and `.xlsx` reading (openpyxl or
  equivalent); validate the presence of `IdAto`/`Flg` for real instead of
  pattern-matching the filename.
- `resultado_lote` should reflect actual per-row apply results against the
  target SQL table (still dry-run — no writes).
- The dedupe rule (409 on a second run for the same `(pais, tabla)` while
  one is `running`) is part of the contract, not a mock-only convenience —
  the real backend must enforce it too.

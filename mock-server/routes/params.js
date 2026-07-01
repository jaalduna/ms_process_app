import { Router } from "express"

// JAA-547 / JAA-546 — mock of the eligibility-params API. Faithful to the
// frozen JAA-546 contract so the editor UI builds + e2e-tests without the real
// FastAPI/SQLite backend. Base path: /api/v1/params.
//
//   GET  /params/{tabla}/{pais}          -> ParamsTableData {country,table,rows,updated_at,updated_by}
//   PUT  /params/{tabla}/{pais}          -> save rows (no publish), returns envelope
//   POST /params/{tabla}/{pais}/validate -> {valid, errors[], warnings[]} (plain strings)
//   POST /params/{tabla}/{pais}/publish  -> PublishResult, or 422 {error,errors[]} when invalid
//
// State is in-memory (like the SQLite source of truth on the real backend):
// per (table,country) we keep the working rows + the last published baseline.

const router = Router()

// ---------------------------------------------------------------------------
// Contract: the 15 eligibility tables (names match the kwp-elegibilidad parquet
// contract) and the 9 supported countries (AR is a known gap).
// ---------------------------------------------------------------------------

export const PARAMS_TABLES = [
  "Code_Parametros",
  "Criterios_Elegibilidad",
  "Criterios_Elegibilidad_Datas",
  "Criterios_Elegibilidad_ExCateg",
  "Estructura",
  "IdDomicilio_Prueba",
  "IdPainel",
  "Imputacion_ExCateg",
  "M_Variables",
  "Origen_NoConsiderar",
  "Parametros_Region",
  "Q_Variables",
  "Validation_Combined_Conditions",
  "Validation_Conditions",
  "Variables",
]

export const PARAMS_COUNTRIES = ["BO", "BR", "BR_MOSAICO", "CAM", "CL", "CO", "EC", "MX", "PE"]

// Controlled vocabulary for the variable-selector tables (Q/M_Variables) — the
// UI offers these as options so a non-existent column is impossible to type.
export const VARIABLE_VOCAB = [
  "Edad",
  "NSE",
  "Region",
  "Genero",
  "Hijos",
  "TipoVivienda",
  "Ocupacion",
  "TamanoHogar",
  "Categoria",
  "Canal",
  "Marca",
  "Frecuencia",
]

function isInt(v) {
  return typeof v === "number" && Number.isInteger(v)
}

// ---------------------------------------------------------------------------
// Per-table validation. Returns plain string arrays (real API shape).
// ---------------------------------------------------------------------------

function validateCodeParametros(rows) {
  const errors = []
  const warnings = []
  const seen = new Set()
  rows.forEach((r, i) => {
    const v = r.Variable
    if (v == null || String(v).trim() === "") errors.push(`row ${i}: 'Variable' is required`)
    else if (seen.has(v)) errors.push(`row ${i}: duplicate Variable '${v}'`)
    else seen.add(v)
    if (!isInt(r.Valor)) errors.push(`row ${i}: 'Valor' = ${JSON.stringify(r.Valor)} is not a valid integer`)
  })
  return { errors, warnings }
}

function validateCriterios(rows) {
  const errors = []
  const warnings = []
  const seen = new Set()
  rows.forEach((r, i) => {
    if (!isInt(r.IdRegla)) errors.push(`row ${i}: 'IdRegla' must be an integer`)
    else if (seen.has(r.IdRegla)) errors.push(`row ${i}: duplicate IdRegla '${r.IdRegla}'`)
    else seen.add(r.IdRegla)
    if (!isInt(r.Semanas) || r.Semanas < 1 || r.Semanas > 52)
      errors.push(`row ${i}: 'Semanas' = ${JSON.stringify(r.Semanas)} out of range (1..52)`)
    if (!isInt(r.Categorias) || r.Categorias < 0) errors.push(`row ${i}: 'Categorias' must be an integer >= 0`)
    if (!isInt(r.Actos) || r.Actos < 0) errors.push(`row ${i}: 'Actos' must be an integer >= 0`)
  })
  return { errors, warnings }
}

function validateVocab(rows, col) {
  const errors = []
  const warnings = []
  const seen = new Set()
  rows.forEach((r, i) => {
    const v = r[col]
    if (v == null || String(v).trim() === "") errors.push(`row ${i}: '${col}' is required`)
    else if (!VARIABLE_VOCAB.includes(v)) errors.push(`row ${i}: '${v}' is not a known variable (out of vocabulary)`)
    else if (seen.has(v)) warnings.push(`row ${i}: '${v}' selected more than once`)
    else seen.add(v)
  })
  return { errors, warnings }
}

function validateEstructura(rows) {
  const errors = []
  const warnings = []
  rows.forEach((r, i) => {
    if (!isInt(r.Muestra_Ideal) || r.Muestra_Ideal < 0)
      errors.push(`row ${i}: 'Muestra_Ideal' must be an integer >= 0`)
  })
  return { errors, warnings }
}

function validateRows(table, rows) {
  switch (table) {
    case "Code_Parametros":
      return validateCodeParametros(rows)
    case "Criterios_Elegibilidad":
      return validateCriterios(rows)
    case "Q_Variables":
      return validateVocab(rows, "Q_Vars")
    case "M_Variables":
      return validateVocab(rows, "M_Vars")
    case "Estructura":
      return validateEstructura(rows)
    default:
      // Tables not specialised in this MVP: accept anything (empty contract).
      return { errors: [], warnings: [] }
  }
}

// ---------------------------------------------------------------------------
// Diff (matches the real publish diff shape: added/removed full rows by value).
// ---------------------------------------------------------------------------

function diffRows(before, after) {
  const key = (r) => JSON.stringify(r)
  const beforeKeys = new Set(before.map(key))
  const afterKeys = new Set(after.map(key))
  const added = after.filter((r) => !beforeKeys.has(key(r)))
  const removed = before.filter((r) => !afterKeys.has(key(r)))
  return {
    row_count_before: before.length,
    row_count_after: after.length,
    added,
    removed,
    added_count: added.length,
    removed_count: removed.length,
  }
}

// ---------------------------------------------------------------------------
// In-memory store + seed.
// ---------------------------------------------------------------------------

const store = new Map() // key "table|country" -> {rows, updated_at, updated_by, published}
let publishCounter = 0

const storeKey = (table, country) => `${table}|${country}`

function seedRowsFor(table, country) {
  switch (table) {
    case "Code_Parametros":
      return [
        { Variable: "umbral_actos", Valor: 3, "Observación": `${country}: min actos` },
        { Variable: "umbral_semanas", Valor: 12, "Observación": "ventana" },
        { Variable: "muestra_min", Valor: 200, "Observación": "" },
      ]
    case "Criterios_Elegibilidad":
      return [
        { IdRegla: 1, Categorias: 3, Semanas: 12, ExCateg: "", Actos: 2 },
        { IdRegla: 2, Categorias: 5, Semanas: 24, ExCateg: "99", Actos: 4 },
      ]
    case "Q_Variables":
      return [{ Q_Vars: "Edad" }, { Q_Vars: "NSE" }, { Q_Vars: "Region" }]
    case "M_Variables":
      return [{ M_Vars: "Categoria" }, { M_Vars: "Marca" }]
    case "Estructura":
      return [
        { Muestra_Ideal: 1000, "Marginal/Categoría": "TOTAL", "Expresión": "Total", Secuencia: 1, Jerarquia: 0 },
        { Muestra_Ideal: 400, "Marginal/Categoría": "ABC1", "Expresión": "NSE==1", Secuencia: 2, Jerarquia: 1 },
        { Muestra_Ideal: 600, "Marginal/Categoría": "C2C3", "Expresión": "NSE==2", Secuencia: 3, Jerarquia: 1 },
      ]
    default:
      return []
  }
}

export function seedParams() {
  store.clear()
  publishCounter = 0
  const seededTables = ["Code_Parametros", "Criterios_Elegibilidad", "Q_Variables", "M_Variables", "Estructura"]
  for (const country of PARAMS_COUNTRIES) {
    for (const table of seededTables) {
      const rows = seedRowsFor(table, country)
      store.set(storeKey(table, country), {
        rows,
        updated_at: null,
        updated_by: null,
        published: rows.map((r) => ({ ...r })),
      })
    }
  }
}

function getEntry(table, country) {
  const k = storeKey(table, country)
  if (!store.has(k)) {
    store.set(k, { rows: [], updated_at: null, updated_by: null, published: [] })
  }
  return store.get(k)
}

function envelope(table, country, entry) {
  return {
    country,
    table,
    rows: entry.rows,
    updated_at: entry.updated_at,
    updated_by: entry.updated_by,
  }
}

function unknownTable(res, table) {
  return res.status(404).json({
    error: "not_found",
    message: `unknown params table '${table}'; contract covers [${PARAMS_TABLES.join(", ")}]`,
  })
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// JAA-628 / JAA-614 — Excel round-trip (per-country, all tables).
//   GET  /params/{pais}/export.xlsx[?template=true] -> xlsx blob
//   POST /params/{pais}/import (multipart xlsx)      -> validate-only preview
// Declared BEFORE the generic GET /params/:tabla/:pais so the literal
// `export.xlsx` segment is not captured as a `:pais` value.
// ---------------------------------------------------------------------------

router.get("/params/:pais/export.xlsx", (req, res) => {
  const { pais } = req.params
  const template = req.query.template === "true" || req.query.template === "1"
  const name = `params_${pais}${template ? "_template" : ""}.xlsx`
  // The mock has no xlsx writer; the UI only needs a real download (correct
  // content-type + Content-Disposition). Bytes need not be a valid workbook.
  const body = Buffer.from(`mock xlsx for ${pais} (${template ? "template" : "values"})`)
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`)
  res.send(body)
})

// Build a deterministic, contract-shaped import preview from the seeded store.
// Default: simulate an uploaded workbook that adds one Code_Parametros row (so
// the diff is visible and publishable). `?scenario=invalid` injects a contract
// error so the publish gate can be exercised. Nothing is ever persisted.
function buildImportResult(pais, scenario) {
  const invalid = scenario === "invalid"
  const tables = []

  const cp = getEntry("Code_Parametros", pais)
  const cpUploaded = invalid
    ? [...cp.published, { Variable: "umbral_excel", Valor: "abc", "Observación": "valor inválido" }]
    : [...cp.published, { Variable: "umbral_excel", Valor: 7, "Observación": "via excel" }]
  tables.push({
    table: "Code_Parametros",
    rows: cpUploaded,
    diff: diffRows(cp.published, cpUploaded),
    errors: invalid ? validateRows("Code_Parametros", cpUploaded).errors : [],
    warnings: [],
  })

  for (const t of ["Criterios_Elegibilidad", "Q_Variables", "M_Variables", "Estructura"]) {
    const e = getEntry(t, pais)
    tables.push({ table: t, rows: e.published, diff: diffRows(e.published, e.published), errors: [], warnings: [] })
  }

  const valid = tables.every((t) => t.errors.length === 0)
  return { country: pais, valid, tables }
}

router.post("/params/:pais/import", (req, res) => {
  const { pais } = req.params
  if (!PARAMS_COUNTRIES.includes(pais)) {
    return res.status(404).json({ error: "not_found", message: `unknown country '${pais}'` })
  }
  // express.json() leaves the multipart body unparsed; like the eligibility mock
  // we ignore the bytes and synthesize a faithful, contract-shaped preview.
  res.json(buildImportResult(pais, req.query.scenario))
})

router.get("/params/:tabla/:pais", (req, res) => {
  const { tabla, pais } = req.params
  if (!PARAMS_TABLES.includes(tabla)) return unknownTable(res, tabla)
  res.json(envelope(tabla, pais, getEntry(tabla, pais)))
})

router.put("/params/:tabla/:pais", (req, res) => {
  const { tabla, pais } = req.params
  if (!PARAMS_TABLES.includes(tabla)) return unknownTable(res, tabla)
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null
  if (rows === null) return res.status(400).json({ error: "bad_request", message: "body.rows must be an array" })
  const entry = getEntry(tabla, pais)
  entry.rows = rows
  entry.updated_at = new Date().toISOString()
  entry.updated_by = "mock-analyst"
  res.json(envelope(tabla, pais, entry))
})

router.post("/params/:tabla/:pais/validate", (req, res) => {
  const { tabla, pais } = req.params
  if (!PARAMS_TABLES.includes(tabla)) return unknownTable(res, tabla)
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : []
  const { errors, warnings } = validateRows(tabla, rows)
  res.json({ valid: errors.length === 0, errors, warnings })
})

router.post("/params/:tabla/:pais/publish", (req, res) => {
  const { tabla, pais } = req.params
  if (!PARAMS_TABLES.includes(tabla)) return unknownTable(res, tabla)
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : []
  const { errors, warnings } = validateRows(tabla, rows)
  if (errors.length > 0) {
    return res.status(422).json({ error: "validation_error", message: "validation failed", errors })
  }
  const entry = getEntry(tabla, pais)
  const diff = diffRows(entry.published, rows)
  entry.rows = rows
  entry.published = rows.map((r) => ({ ...r }))
  entry.updated_at = new Date().toISOString()
  entry.updated_by = "mock-analyst"
  publishCounter += 1
  const publishId = `pub_${Date.now()}_${publishCounter}`
  const publishedAt = new Date().toISOString()
  res.json({
    country: pais,
    table: tabla,
    publish_id: publishId,
    published_at: publishedAt,
    parquet_path: `params_configs/${pais}/Parametros/${tabla}.parquet`,
    versioned_path: `params_configs/${pais}/Parametros/.versions/${tabla}.${publishId}.parquet`,
    row_count: rows.length,
    diff,
    warnings,
  })
})

export default router

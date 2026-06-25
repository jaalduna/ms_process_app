import { Router } from "express"

// JAA-581 / JAA-576 / JAA-578 / JAA-579 — mock of the weighting-params API.
// This is the contract seam that lets the Pesaje "Parametros" tab build +
// e2e-test without the real FastAPI backend. Base path:
//   /api/v1/weighting/params/{pais}/...
//
//   GET  /weighting/params/{pais}/idpeso-config         -> {country, rows}
//   GET  /weighting/params/{pais}/variables             -> {country, q_vars, m_vars}
//   GET  /weighting/params/{pais}/universo              -> {country, rows, version}
//   POST /weighting/params/{pais}/{tabla}/validate       -> {valid, errors:[{row,field,message}]}
//   POST /weighting/params/{pais}/{tabla}/publish        -> publish result | 422 {error,errors}
//   GET  /weighting/params/{pais}/{tabla}/history        -> [{version,author,published_at,hash,row_count}]
//
// {tabla} for validate ∈ {idpeso-config, variables, universo};
// {tabla} for publish/history ∈ {idpeso-config, variables} (Universo is published
// via the Excel-upload flow, JAA-582 — out of scope here).
//
// State is in-memory (mirrors the SQLite source of truth on the real backend):
// per (pais,tabla) we keep the working rows + an append-only publish history.

const router = Router()

export const WEIGHTING_PARAMS_COUNTRIES = ["chile", "mexico", "brasil", "peru", "bolivia"]
export const PUBLISHABLE_TABLES = ["idpeso-config", "variables"]
export const VALIDATABLE_TABLES = ["idpeso-config", "variables", "universo"]

// Controlled vocabulary for the Q/M variable selectors — the UI offers these so
// a non-existent panel column is impossible to type. Mirrors the frontend
// VARIABLE_VOCAB in src/modules/pesaje/params/types.ts.
export const VARIABLE_VOCAB = [
  "EDBEQ",
  "IMEQ",
  "NIMEQ",
  "EDBQ",
  "NT",
  "IME_NEW_M",
  "NIME_MES",
  "BEBE_MES",
  "GEO_3",
  "GEO_15",
  "GEO_208",
  "GEO_219",
  "GEO_261",
  "GEO_275",
]

const UNIVERSO_PERIODS = ["Q3-25", "Q4-25", "Q1-26", "Q2-26"]

// ---------------------------------------------------------------------------
// Seed data (per country). Shapes mirror the JAA-576 Pydantic responses.
// ---------------------------------------------------------------------------

function seedIdPeso() {
  return [
    { idpeso: 1, nombre: "Mensual", per_min: 1, periodos: 1, obs: "Se realiza todos los meses" },
    { idpeso: 2, nombre: "Ult2", per_min: 2, periodos: 2, obs: null },
    { idpeso: 3, nombre: "Ult3", per_min: 3, periodos: 3, obs: null },
    { idpeso: 4, nombre: "Ult4", per_min: 3, periodos: 4, obs: null },
    { idpeso: 5, nombre: "Ult6", per_min: 5, periodos: 6, obs: null },
    { idpeso: 6, nombre: "Ult12", per_min: 11, periodos: 12, obs: null },
    { idpeso: 7, nombre: "Ult18", per_min: 17, periodos: 18, obs: null },
    { idpeso: 8, nombre: "Ult24", per_min: 23, periodos: 24, obs: "Se realiza todos los meses" },
    { idpeso: 20, nombre: "Ult9", per_min: 8, periodos: 9, obs: null },
  ]
}

const VARIABLES_SEED = {
  chile: { q_vars: ["EDBEQ"], m_vars: [] },
  mexico: { q_vars: ["NIMEQ"], m_vars: ["NIME_MES"] },
  brasil: { q_vars: ["IMEQ"], m_vars: ["BEBE_MES", "GEO_208", "GEO_3", "GEO_219"] },
  peru: { q_vars: [], m_vars: ["EDBQ"] },
  bolivia: { q_vars: ["EDBEQ"], m_vars: [] },
}

function seedUniverso() {
  const row = (categoria, expresion, jerarquia, secuencia, marginales, vals) => ({
    categoria,
    expresion,
    jerarquia,
    secuencia,
    marginales,
    marginales_por_periodo: {
      "Q3-25": vals[0],
      "Q4-25": vals[1],
      "Q1-26": vals[2],
      "Q2-26": vals[3],
    },
  })
  return [
    row("TOTAL Hogares", "[ALL]", 0, 0, 0, [6240000, 6255000, 6270000, 6285000]),
    row("ABC1", "[NSE_AIM] = 8 OR [NSE_AIM] = 9", 1, 1, 1, [936000, 938250, 940500, 942750]),
    row("C2", "[NSE_AIM] = 7", 1, 2, 1, [1248000, 1251000, 1254000, 1257000]),
    row("C3", "[NSE_AIM] = 6", 1, 3, 1, [1560000, 1563750, 1567500, 1571250]),
    row("D", "[NSE_AIM] = 4 OR [NSE_AIM] = 5", 1, 4, 1, [1872000, 1876500, 1881000, 1885500]),
    row("E", "[NSE_AIM] = 1 OR [NSE_AIM] = 2 OR [NSE_AIM] = 3", 1, 5, 1, [624000, 625500, 627000, 628500]),
  ]
}

// ---------------------------------------------------------------------------
// In-memory store: state[pais][tabla] = { rows, history: [version,...] }
// ---------------------------------------------------------------------------

const state = {}

function ensureCountry(pais) {
  if (!state[pais]) {
    state[pais] = {
      "idpeso-config": { rows: seedIdPeso(), history: [] },
      variables: { rows: VARIABLES_SEED[pais] ?? { q_vars: [], m_vars: [] }, history: [] },
      universo: { rows: seedUniverso(), history: [] },
    }
  }
  return state[pais]
}

function isKnownCountry(pais) {
  return WEIGHTING_PARAMS_COUNTRIES.includes(pais)
}

// A stable content hash (FNV-1a) over canonical JSON — same content => same hash,
// which is what makes publish idempotent ("Sin cambios" => no new version).
function contentHash(value) {
  const canonical = canonicalJSON(value)
  let h = 0x811c9dc5
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, "0")
}

function canonicalJSON(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJSON(value[k])}`)
      .join(",")}}`
  }
  return JSON.stringify(value ?? null)
}

// ---------------------------------------------------------------------------
// Validators — structured errors [{row, field, message}]. Rules mirror the
// frontend live validators (src/modules/pesaje/params/validation.ts) so the
// client and server agree.
// ---------------------------------------------------------------------------

const isInt = (v) => typeof v === "number" && Number.isInteger(v)

function validateIdPeso(rows) {
  const errors = []
  if (!Array.isArray(rows)) return [{ row: null, field: "rows", message: "Se esperaba una lista de filas." }]
  const seen = new Set()
  rows.forEach((r, i) => {
    if (seen.has(r.idpeso)) errors.push({ row: i, field: "idpeso", message: `IdPeso ${r.idpeso} duplicado — debe ser único.` })
    seen.add(r.idpeso)
    if (!r.nombre || !String(r.nombre).trim()) errors.push({ row: i, field: "nombre", message: "Nombre vacío." })
    if (!isInt(r.periodos) || r.periodos < 1) errors.push({ row: i, field: "periodos", message: "Periodos debe ser un entero ≥ 1." })
    if (!isInt(r.per_min) || r.per_min < 0) errors.push({ row: i, field: "per_min", message: "Per_Min debe ser un entero ≥ 0." })
  })
  return errors
}

function validateVariables(payload) {
  const errors = []
  const vocab = new Set(VARIABLE_VOCAB)
  const check = (field, list) => {
    if (!Array.isArray(list)) {
      errors.push({ row: null, field, message: "Se esperaba una lista de variables." })
      return
    }
    list.forEach((v) => {
      if (!v || !String(v).trim()) errors.push({ row: null, field, message: "Variable vacía — selecciona del vocabulario." })
      else if (!vocab.has(v)) errors.push({ row: null, field, message: `Variable '${v}' fuera del vocabulario del panel — romperá el pivot.` })
    })
  }
  check("q_vars", payload?.q_vars)
  check("m_vars", payload?.m_vars)
  return errors
}

function validateUniverso(rows) {
  const errors = []
  if (!Array.isArray(rows)) return [{ row: null, field: "rows", message: "Se esperaba una lista de filas." }]
  rows.forEach((r, i) => {
    for (const p of UNIVERSO_PERIODS) {
      const v = r?.marginales_por_periodo?.[p]
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0)
        errors.push({ row: i, field: p, message: `Marginal (${p}) debe ser un número ≥ 0.` })
    }
  })
  const total = rows.find((r) => r.marginales === 0)
  const leaves = rows.filter((r) => r.marginales === 1)
  if (total) {
    for (const p of UNIVERSO_PERIODS) {
      const sum = leaves.reduce((acc, r) => acc + (Number(r?.marginales_por_periodo?.[p]) || 0), 0)
      const declared = Number(total?.marginales_por_periodo?.[p]) || 0
      if (sum !== declared)
        errors.push({ row: null, field: p, message: `La suma de estratos (${sum}) no cuadra con el TOTAL (${declared}) en ${p}.` })
    }
  }
  return errors
}

function validatePayload(tabla, body) {
  if (tabla === "idpeso-config") return validateIdPeso(body?.rows)
  if (tabla === "variables") return validateVariables(body)
  if (tabla === "universo") return validateUniverso(body?.rows)
  return null
}

// Extract the canonical, hashable content from a publish/validate body.
function contentOf(tabla, body) {
  if (tabla === "variables") return { q_vars: body?.q_vars ?? [], m_vars: body?.m_vars ?? [] }
  return { rows: body?.rows ?? [] }
}

function rowCountOf(tabla, content) {
  if (tabla === "variables") return (content.q_vars?.length ?? 0) + (content.m_vars?.length ?? 0)
  return content.rows?.length ?? 0
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.get("/weighting/params/:pais/idpeso-config", (req, res) => {
  const { pais } = req.params
  if (!isKnownCountry(pais)) return notFoundCountry(res, pais)
  const entry = ensureCountry(pais)["idpeso-config"]
  res.json({ country: pais, rows: entry.rows })
})

router.get("/weighting/params/:pais/variables", (req, res) => {
  const { pais } = req.params
  if (!isKnownCountry(pais)) return notFoundCountry(res, pais)
  const entry = ensureCountry(pais).variables
  res.json({ country: pais, q_vars: entry.rows.q_vars ?? [], m_vars: entry.rows.m_vars ?? [] })
})

router.get("/weighting/params/:pais/universo", (req, res) => {
  const { pais } = req.params
  if (!isKnownCountry(pais)) return notFoundCountry(res, pais)
  const entry = ensureCountry(pais).universo
  res.json({
    country: pais,
    rows: entry.rows,
    version: {
      hash: contentHash({ rows: entry.rows }),
      modified_at: "2026-06-01T00:00:00Z",
      row_count: entry.rows.length,
    },
  })
})

router.post("/weighting/params/:pais/:tabla/validate", (req, res) => {
  const { pais, tabla } = req.params
  if (!isKnownCountry(pais)) return notFoundCountry(res, pais)
  if (!VALIDATABLE_TABLES.includes(tabla)) return unknownTable(res, tabla)
  const errors = validatePayload(tabla, req.body)
  res.json({ valid: errors.length === 0, errors })
})

router.post("/weighting/params/:pais/:tabla/publish", (req, res) => {
  const { pais, tabla } = req.params
  if (!isKnownCountry(pais)) return notFoundCountry(res, pais)
  if (!PUBLISHABLE_TABLES.includes(tabla)) return unknownTable(res, tabla)

  const errors = validatePayload(tabla, req.body)
  if (errors.length > 0) {
    return res.status(422).json({ error: "validation_error", message: "El draft tiene errores de validación.", errors })
  }

  const entry = ensureCountry(pais)[tabla]
  const content = contentOf(tabla, req.body)
  const hash = contentHash(content)
  const last = entry.history[entry.history.length - 1]

  if (last && last.hash === hash) {
    return res.json({
      country: pais,
      table: tabla,
      version: last.version,
      unchanged: true,
      author: last.author,
      published_at: last.published_at,
      hash,
      diff: { added_count: 0, removed_count: 0, changed_count: 0 },
    })
  }

  const prevCount = last ? last.row_count : rowCountOf(tabla, contentOf(tabla, normalizeStored(tabla, entry.rows)))
  const nextCount = rowCountOf(tabla, content)
  const version = {
    version: entry.history.length + 1,
    author: "dev@local",
    published_at: "2026-06-25T12:00:00Z",
    hash,
    row_count: nextCount,
  }
  entry.history.push(version)
  entry.rows = tabla === "variables" ? { q_vars: content.q_vars, m_vars: content.m_vars } : content.rows

  res.json({
    country: pais,
    table: tabla,
    version: version.version,
    unchanged: false,
    author: version.author,
    published_at: version.published_at,
    hash,
    diff: {
      added_count: Math.max(0, nextCount - prevCount),
      removed_count: Math.max(0, prevCount - nextCount),
      changed_count: Math.min(prevCount, nextCount),
    },
  })
})

router.get("/weighting/params/:pais/:tabla/history", (req, res) => {
  const { pais, tabla } = req.params
  if (!isKnownCountry(pais)) return notFoundCountry(res, pais)
  if (!PUBLISHABLE_TABLES.includes(tabla)) return unknownTable(res, tabla)
  const entry = ensureCountry(pais)[tabla]
  res.json([...entry.history].reverse())
})

function normalizeStored(tabla, rows) {
  return tabla === "variables" ? rows : { rows }
}

function notFoundCountry(res, pais) {
  return res.status(404).json({ error: "not_found", message: `País '${pais}' no tiene parámetros de pesaje.` })
}

function unknownTable(res, tabla) {
  return res.status(404).json({ error: "not_found", message: `Tabla de parámetros desconocida: '${tabla}'.` })
}

export default router

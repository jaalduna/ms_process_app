import { Router } from "express"

// JAA-581 / JAA-576 / JAA-578 / JAA-579 — mock of the weighting-params API.
// This is the contract seam that lets the Pesaje "Parametros" tab build +
// e2e-test without the real FastAPI backend. Base path:
//   /api/v1/weighting/params/{pais}/...
//
//   GET  /weighting/params/{pais}/idpeso-config         -> {country, rows}
//   GET  /weighting/params/{pais}/variables             -> {country, q_vars, m_vars}
//   GET  /weighting/params/{pais}/universo              -> {country, rows, version}
//   GET  /weighting/params/{pais}/execution-params      -> {country, params, version|null}
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

// JAA-752: the frontend now sends the país CODE (AR, BO, …), not the name —
// the real /weighting/params/{code}/... endpoints 404 on the name. Mirrors
// src/modules/pesaje/params/types.ts COUNTRIES.
export const WEIGHTING_PARAMS_COUNTRIES = ["AR", "BO", "BR", "CAM", "CL", "CO", "EC", "MX", "PE"]
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

// The 10 F-001 weighting hyperparameters and their defaults — mirrors the real
// API's HYPERPARAM_DEFAULTS (weighting_validators.py). The `idpeso-config`
// validate/publish endpoints operate on THIS dict (JAA-670), not on the rows
// the same-named GET returns.
export const HYPERPARAM_DEFAULTS = {
  N_PERIODOS_OUTLIERS: 12,
  MAX_ROUNDS_COLAPSO: 50,
  JERARQUIA_MIN_COLAPSO: 1,
  MANUAL_COLLAPSES: [],
  CORRECAO_BOUNDS: true,
  METODO_BOUNDS: "percentile",
  P_BOUNDS: 2,
  F_BOUNDS: 1.1,
  AGREGACAO_BOUNDS: "union",
  MAX_ERR_RATIO_BOUNDS: 2.0,
}

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
  CL: { q_vars: ["EDBEQ"], m_vars: [] },
  MX: { q_vars: ["NIMEQ"], m_vars: ["NIME_MES"] },
  BR: { q_vars: ["IMEQ"], m_vars: ["BEBE_MES", "GEO_208", "GEO_3", "GEO_219"] },
  PE: { q_vars: [], m_vars: ["EDBQ"] },
  BO: { q_vars: ["EDBEQ"], m_vars: [] },
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

// Validated-but-not-yet-published Universo uploads. token -> { pais, rows }.
// Minted on a valid upload, consumed (deleted) on publish — so a token publishes
// at most once. Mirrors the real `universo_uploads` pending-token table.
const pendingUploads = new Map()
let uploadCounter = 0

function ensureCountry(pais) {
  if (!state[pais]) {
    state[pais] = {
      // `rows` feeds the read-only rows GET; `params` is the published
      // hyperparams draft (null = nothing published, GET serves defaults).
      "idpeso-config": { rows: seedIdPeso(), params: null, history: [] },
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
const isReal = (v) => typeof v === "number" && Number.isFinite(v)

// F-001 hyperparams validation — mirrors the real API's `validate_hyperparams`
// (ms-process-api weighting_validators.py): per-field type/range/enum rules,
// unknown keys rejected, absent keys take their default (not an error).
function validateHyperparams(params) {
  if (params == null || typeof params !== "object" || Array.isArray(params))
    return [{ row: null, field: "params", message: "Se esperaba un dict de hiperparámetros." }]
  const errors = []
  const err = (field, message) => errors.push({ row: null, field, message })
  for (const key of Object.keys(params)) {
    if (!(key in HYPERPARAM_DEFAULTS)) err(key, `Parámetro desconocido: ${key}.`)
  }
  const p = params
  if ("N_PERIODOS_OUTLIERS" in p && (!isInt(p.N_PERIODOS_OUTLIERS) || p.N_PERIODOS_OUTLIERS <= 0))
    err("N_PERIODOS_OUTLIERS", "Debe ser un entero > 0.")
  if ("MAX_ROUNDS_COLAPSO" in p && (!isInt(p.MAX_ROUNDS_COLAPSO) || p.MAX_ROUNDS_COLAPSO < 0))
    err("MAX_ROUNDS_COLAPSO", "Debe ser un entero ≥ 0.")
  if ("JERARQUIA_MIN_COLAPSO" in p && p.JERARQUIA_MIN_COLAPSO !== null && (!isInt(p.JERARQUIA_MIN_COLAPSO) || p.JERARQUIA_MIN_COLAPSO < 1))
    err("JERARQUIA_MIN_COLAPSO", "Debe ser None o un entero ≥ 1.")
  if ("CORRECAO_BOUNDS" in p && typeof p.CORRECAO_BOUNDS !== "boolean")
    err("CORRECAO_BOUNDS", "Debe ser booleano (true/false).")
  if ("METODO_BOUNDS" in p && !["percentile", "iqr", "log"].includes(p.METODO_BOUNDS))
    err("METODO_BOUNDS", "Debe ser uno de: percentile, iqr, log.")
  if ("P_BOUNDS" in p && (!isInt(p.P_BOUNDS) || !(p.P_BOUNDS > 0 && p.P_BOUNDS < 50)))
    err("P_BOUNDS", "Debe ser un entero con 0 < P_BOUNDS < 50.")
  if ("F_BOUNDS" in p && (!isReal(p.F_BOUNDS) || p.F_BOUNDS <= 0))
    err("F_BOUNDS", "Debe ser un número > 0.")
  if ("AGREGACAO_BOUNDS" in p && !["union", "intersection"].includes(p.AGREGACAO_BOUNDS))
    err("AGREGACAO_BOUNDS", "Debe ser uno de: union, intersection.")
  if ("MAX_ERR_RATIO_BOUNDS" in p && (!isReal(p.MAX_ERR_RATIO_BOUNDS) || p.MAX_ERR_RATIO_BOUNDS <= 0))
    err("MAX_ERR_RATIO_BOUNDS", "Debe ser un número > 0.")
  if ("MANUAL_COLLAPSES" in p && !Array.isArray(p.MANUAL_COLLAPSES))
    err("MANUAL_COLLAPSES", "Debe ser una lista de pares (keep, remove).")
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
  if (tabla === "idpeso-config") return validateHyperparams(body?.params)
  if (tabla === "variables") return validateVariables(body)
  if (tabla === "universo") return validateUniverso(body?.rows)
  return null
}

// Extract the canonical, hashable content from a publish/validate body.
function contentOf(tabla, body) {
  if (tabla === "variables") return { q_vars: body?.q_vars ?? [], m_vars: body?.m_vars ?? [] }
  if (tabla === "idpeso-config") return { params: body?.params ?? {} }
  return { rows: body?.rows ?? [] }
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

// ---------------------------------------------------------------------------
// Universo Excel upload flow (JAA-580 / JAA-583): subir .xlsx -> validar ->
// preview diff -> publicar versión nueva. Declared BEFORE the generic
// /:tabla/publish so "universo/publish" is not shadowed by it.
//
// The mock has no multipart/xlsx parser (the real backend uses openpyxl); it
// decides valid/invalid from the ?filename query — filenames containing
// "invalid" simulate a bad sheet. A valid upload synthesizes the parsed rows
// (current + one new strata + a bumped marginal) so the preview diff and the
// post-publish version are deterministic and non-trivial.
// ---------------------------------------------------------------------------

function synthesizeUpload(currentRows) {
  const next = currentRows.map((r) => ({
    ...r,
    marginales_por_periodo: { ...r.marginales_por_periodo },
  }))
  // changed = 1: bump one existing leaf's marginals
  const leaf = next.find((r) => r.marginales === 1)
  if (leaf) for (const p of UNIVERSO_PERIODS) leaf.marginales_por_periodo[p] += 1000
  // added = 1: one brand-new strata
  next.push({
    categoria: "F (nuevo)",
    expresion: "[NSE_AIM] = 0",
    jerarquia: 1,
    secuencia: next.length,
    marginales: 1,
    marginales_por_periodo: { "Q3-25": 1000, "Q4-25": 1000, "Q1-26": 1000, "Q2-26": 1000 },
  })
  return next
}

function previewDiff(before, after) {
  const key = (r) => r.categoria
  const beforeKeys = new Set(before.map(key))
  const beforeByKey = new Map(before.map((r) => [key(r), r]))
  const afterKeys = new Set(after.map(key))
  const added = after.filter((r) => !beforeKeys.has(key(r))).length
  const removed = before.filter((r) => !afterKeys.has(key(r))).length
  let changed = 0
  for (const r of after) {
    const b = beforeByKey.get(key(r))
    if (b && JSON.stringify(b.marginales_por_periodo) !== JSON.stringify(r.marginales_por_periodo)) changed++
  }
  return { added, removed, changed }
}

router.post("/weighting/params/:pais/universo/upload", (req, res) => {
  const { pais } = req.params
  if (!isKnownCountry(pais)) return notFoundCountry(res, pais)
  const filename = String(req.query.filename || "Universo.xlsx")
  if (/invalid/i.test(filename)) {
    return res.json({
      valid: false,
      errors: [
        { row: 3, field: "Q2-26", message: "Se esperaba un entero ≥ 0; se encontró texto." },
        { row: null, field: "Q1-26", message: "Falta la columna 'Q1-26' en la hoja del país." },
      ],
      preview: { added: 0, removed: 0, changed: 0 },
      upload_token: null,
    })
  }
  const current = ensureCountry(pais).universo.rows
  const nextRows = synthesizeUpload(current)
  uploadCounter += 1
  const token = `utok_${pais}_${uploadCounter}`
  pendingUploads.set(token, { pais, rows: nextRows })
  res.json({
    valid: true,
    errors: [],
    preview: previewDiff(current, nextRows),
    upload_token: token,
  })
})

router.post("/weighting/params/:pais/universo/publish", (req, res) => {
  const { pais } = req.params
  if (!isKnownCountry(pais)) return notFoundCountry(res, pais)
  const token = req.body?.upload_token
  const pending = token ? pendingUploads.get(token) : null
  if (!pending || pending.pais !== pais) {
    return res.status(404).json({
      error: "not_found",
      message: "upload_token inválido, ya consumido o de otro país.",
    })
  }
  pendingUploads.delete(token)
  const entry = ensureCountry(pais).universo
  entry.rows = pending.rows
  const hash = contentHash({ rows: entry.rows })
  const nextVersion = entry.history.length + 1
  // Mirror the real JAA-580 UniversoPublishResponse: `version` is the nested
  // WeightingParamsVersion object (NOT a flat number).
  const version = {
    version: nextVersion,
    version_id: `wv_universo_${pais}_${nextVersion}`,
    hash,
    published_by: "dev@local",
    published_at: "2026-06-25T12:00:00Z",
    diff: {},
  }
  entry.history.push({ ...version, row_count: entry.rows.length })
  res.json({
    country: pais,
    table: "universo",
    unchanged: false,
    row_count: entry.rows.length,
    version,
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

  // Mirror the real JAA-579 WeightingPublishResponse: `version` is the nested
  // WeightingParamsVersion object (NOT a flat number).
  if (last && last.hash === hash) {
    return res.json({ country: pais, table: tabla, unchanged: true, version: last })
  }

  const version = {
    version: entry.history.length + 1,
    version_id: `wv_${tabla}_${pais}_${entry.history.length + 1}`,
    hash,
    published_by: "dev@local",
    published_at: "2026-06-25T12:00:00Z",
    diff: {},
  }
  entry.history.push(version)
  if (tabla === "variables") entry.rows = { q_vars: content.q_vars, m_vars: content.m_vars }
  else entry.params = content.params // hyperparams — the rows GET stays untouched (JAA-670)

  res.json({ country: pais, table: tabla, unchanged: false, version })
})

// Effective hyperparameters: latest published draft merged over the F-001
// defaults; version null when nothing has been published yet. Mirrors the real
// GET /weighting/params/{pais}/execution-params.
router.get("/weighting/params/:pais/execution-params", (req, res) => {
  const { pais } = req.params
  if (!isKnownCountry(pais)) return notFoundCountry(res, pais)
  const entry = ensureCountry(pais)["idpeso-config"]
  const last = entry.history[entry.history.length - 1] ?? null
  res.json({
    country: pais,
    params: { ...HYPERPARAM_DEFAULTS, ...(entry.params ?? {}) },
    version: entry.params ? last : null,
  })
})

router.get("/weighting/params/:pais/:tabla/history", (req, res) => {
  const { pais, tabla } = req.params
  if (!isKnownCountry(pais)) return notFoundCountry(res, pais)
  if (!PUBLISHABLE_TABLES.includes(tabla)) return unknownTable(res, tabla)
  const entry = ensureCountry(pais)[tabla]
  res.json([...entry.history].reverse())
})

// Reset all weighting-params state (re-seeded lazily per country on next GET)
// and drop any pending Universo uploads — keeps e2e runs deterministic.
export function resetWeightingParams() {
  for (const k of Object.keys(state)) delete state[k]
  pendingUploads.clear()
  uploadCounter = 0
}

function notFoundCountry(res, pais) {
  return res.status(404).json({ error: "not_found", message: `País '${pais}' no tiene parámetros de pesaje.` })
}

function unknownTable(res, tabla) {
  return res.status(404).json({ error: "not_found", message: `Tabla de parámetros desconocida: '${tabla}'.` })
}

export default router

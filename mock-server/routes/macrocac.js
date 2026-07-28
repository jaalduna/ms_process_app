import { Router } from "express"
import crypto from "crypto"

// JAA-1048 — mock of the macrocac API. macrocac applies row-level corrections
// (an Excel with IdAto, Flg=M/E, and optional New* columns) to production SQL
// tables, always in dry-run mode, and produces two Excel reports (reporte and
// reporte-diff). This is the contract seam that lets the UI (JAA-1051/1053)
// build without the real backend (JAA-1052, ms-process-api, must implement
// this same contract with real xlsx validation). Base path: /api/v1/macrocac.
//
//   POST /macrocac/uploads?filename=&pais=&tabla=  -> 201 {upload_id,filename,pais,tabla,motivo,filas,columnas}
//                                                       | 422 {error:"missing_columns",missing_columns}
//                                                       | 400 unknown pais/tabla
//   POST /macrocac/runs {upload_id}                -> 201 {run_id,status:"running",dry_run:true,pais,tabla,upload_id,created_at}
//                                                       | 404 unknown upload_id
//                                                       | 409 {error:"run_in_progress",run_id} active run for same (pais,tabla)
//   GET  /macrocac/runs                            -> {items,total}
//   GET  /macrocac/runs/:runId                     -> run status; resultado_lote populated once status="succeeded"
//   GET  /macrocac/runs/:runId/reporte             -> xlsx blob | 409 unless succeeded
//   GET  /macrocac/runs/:runId/reporte-diff        -> xlsx blob | 409 unless succeeded
//
// The mock has no multipart/xlsx parser (express.json() leaves the upload
// body unparsed) — filename/pais/tabla travel via query string, mirroring
// eligibility.js/weighting-params.js. Filenames containing "sin-idato" or
// "invalid" simulate a sheet missing the mandatory IdAto/Flg columns.
//
// State is in-memory: uploads keyed by upload_id, runs keyed by run_id, plus
// a (pais,tabla) -> active run_id index that backs the dedupe rule.

const router = Router()

export const MACROCAC_COUNTRIES = ["BO", "CL", "MX", "CO", "EC", "PE"]
export const MACROCAC_TABLES = ["j_atoscompra_new", "j_atoscompra_new_test", "hato_cabecalho_ooh"]

// Same knob qms_tr.js uses for fast, deterministic e2e progression.
const STEP_INTERVAL_MS = () => Number(process.env.MOCK_STEP_INTERVAL_MS) || 2000

const CORRECTION_COLUMNS = [
  "IdAto",
  "Flg",
  "NewQuantidade",
  "NewPreco",
  "NewIdCanal",
  "NewForma_Compra",
  "NewUnidadesPack",
  "NewDataCompra",
  "NewIdArtigo",
  "NewPacksComprados",
]

const uuid = () => crypto.randomUUID()
const isoNow = () => new Date().toISOString()

/** @type {Map<string, object>} upload_id -> upload envelope */
const uploads = new Map()
/** @type {Map<string, object>} run_id -> run */
const runs = new Map()
/** @type {Map<string, string>} "pais|tabla" -> active run_id */
const activeRunByKey = new Map()
/** @type {Map<string, NodeJS.Timeout>} */
const timers = new Map()

let uploadCounter = 0

function activeKey(pais, tabla) {
  return `${pais}|${tabla}`
}

export function resetMacrocac() {
  for (const timer of timers.values()) clearInterval(timer)
  timers.clear()
  uploads.clear()
  runs.clear()
  activeRunByKey.clear()
  uploadCounter = 0
}

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

function synthesizeResultadoLote() {
  // 14 rows, coherent with correcciones_bo.xlsx: a mix of M(odify)/E(rase)
  // actions, one deliberate failure so the UI has a realistic error to show.
  const rows = []
  for (let i = 1; i <= 14; i++) {
    const accion = i % 2 === 0 ? "E" : "M"
    const ok = i !== 9
    rows.push({
      IdAto: 900000 + i,
      ok,
      mensaje: ok
        ? accion === "M"
          ? "Actualizado correctamente."
          : "Eliminado correctamente."
        : "No se encontró IdAto en la tabla destino.",
      accion,
    })
  }
  return rows
}

router.post("/macrocac/uploads", (req, res) => {
  const filename = String(req.query.filename || "correcciones.xlsx")
  const pais = String(req.query.pais || "")
  const tabla = String(req.query.tabla || "")

  if (!MACROCAC_COUNTRIES.includes(pais)) {
    return res.status(400).json({ error: "bad_request", message: `País desconocido: '${pais}'.` })
  }
  if (!MACROCAC_TABLES.includes(tabla)) {
    return res.status(400).json({ error: "bad_request", message: `Tabla desconocida: '${tabla}'.` })
  }

  if (/sin-idato|invalid/i.test(filename)) {
    return res.status(422).json({
      error: "missing_columns",
      missing_columns: ["IdAto", "Flg"],
    })
  }

  uploadCounter += 1
  const uploadId = `upl_macrocac_${uploadCounter}`
  const upload = {
    upload_id: uploadId,
    filename,
    pais,
    tabla,
    motivo: "Corrección de campos de compra mal capturados en el operativo de campo.",
    filas: 14,
    columnas: CORRECTION_COLUMNS,
  }
  uploads.set(uploadId, upload)
  res.status(201).json(upload)
})

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

function serializeRun(run) {
  const { _resultadoLote, ...rest } = run
  return { ...rest, resultado_lote: run.status === "succeeded" ? _resultadoLote : null }
}

function advanceRun(runId) {
  const run = runs.get(runId)
  if (!run || run.status === "succeeded") return
  run.status = "succeeded"
  run.completed_at = isoNow()
  run._resultadoLote = synthesizeResultadoLote()
  activeRunByKey.delete(activeKey(run.pais, run.tabla))
}

function startProgression(runId) {
  const timer = setTimeout(() => {
    advanceRun(runId)
    timers.delete(runId)
  }, STEP_INTERVAL_MS())
  timers.set(runId, timer)
}

router.post("/macrocac/runs", (req, res) => {
  const { upload_id: uploadId } = req.body || {}
  const upload = uploadId ? uploads.get(uploadId) : null
  if (!upload) {
    return res.status(404).json({ error: "not_found", message: `Upload '${uploadId}' no encontrado.` })
  }

  const key = activeKey(upload.pais, upload.tabla)
  const existingRunId = activeRunByKey.get(key)
  if (existingRunId) {
    return res.status(409).json({
      error: "run_in_progress",
      message: `Ya hay un run activo para ${upload.pais}/${upload.tabla}.`,
      run_id: existingRunId,
    })
  }

  const runId = `run_macrocac_${uuid()}`
  const now = isoNow()
  const run = {
    run_id: runId,
    status: "running",
    dry_run: true,
    pais: upload.pais,
    tabla: upload.tabla,
    upload_id: upload.upload_id,
    created_at: now,
    completed_at: null,
    _resultadoLote: null,
  }
  runs.set(runId, run)
  activeRunByKey.set(key, runId)
  startProgression(runId)

  res.status(201).json(serializeRun(run))
})

router.get("/macrocac/runs", (req, res) => {
  const items = Array.from(runs.values())
    .map(serializeRun)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  res.json({ items, total: items.length })
})

router.get("/macrocac/runs/:runId", (req, res) => {
  const run = runs.get(req.params.runId)
  if (!run) return res.status(404).json({ error: "not_found", message: `Run '${req.params.runId}' no encontrado.` })
  res.json(serializeRun(run))
})

// ---------------------------------------------------------------------------
// Report downloads — no xlsx writer in the mock (mirrors weighting-params.js's
// export.xlsx precedent), just a buffer stub with the right content-type and
// Content-Disposition.
// ---------------------------------------------------------------------------

function downloadReport(res, run, suffix) {
  if (run.status !== "succeeded") {
    return res.status(409).json({ error: "run_not_finished", message: `Run is still ${run.status}` })
  }
  const pais = run.pais.toLowerCase()
  const filename = suffix ? `reporte_${pais}_${suffix}.xlsx` : `reporte_${pais}.xlsx`
  const body = Buffer.from(`mock macrocac report for ${run.pais}/${run.tabla} run=${run.run_id} (${suffix || "reporte"})`)
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
  res.send(body)
}

router.get("/macrocac/runs/:runId/reporte", (req, res) => {
  const run = runs.get(req.params.runId)
  if (!run) return res.status(404).json({ error: "not_found", message: `Run '${req.params.runId}' no encontrado.` })
  downloadReport(res, run, null)
})

router.get("/macrocac/runs/:runId/reporte-diff", (req, res) => {
  const run = runs.get(req.params.runId)
  if (!run) return res.status(404).json({ error: "not_found", message: `Run '${req.params.runId}' no encontrado.` })
  downloadReport(res, run, "diff")
})

export default router

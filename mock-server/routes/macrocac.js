import { Router } from "express"
import crypto from "crypto"

// Mock de la API de PythonCac (módulo `macrocac`). Aplica correcciones fila a
// fila (un Excel con IdAto, Flg=M/E y columnas New*) sobre las tablas de
// compras y produce un reporte Excel. Base path: /api/v1/macrocac.
//
// ⚠️ NO hay dry-run. El motor canónico (KWP-macrocac) abre transacción, aplica
// los UPDATE/DELETE y hace COMMIT; no tiene modo simulación. El campo
// `dry_run` sigue en el contrato porque el backend real lo manda (refleja qué
// runner está activo), pero es `false` cuando el motor es el real. Por eso el
// flujo de la UI es subir → verificar formato → CONFIRMAR → aplicar.
//
// Contrato espejado de `wp-pythoncac-app/backend` (fuente de verdad):
//   GET  /macrocac/tablas?pais=            -> {items,pais,patrones}
//   GET  /macrocac/motivos?pais=           -> {items,pais,stale,age_seconds}
//   GET  /macrocac/plantilla               -> xlsx blob
//   POST /macrocac/uploads?filename=&pais=&tabla=&motivo=&auxiliar=
//                                          -> 201 upload | 422 missing_columns
//                                             | 400 bad_request | 422 motivo_requerido
//   POST /macrocac/runs {upload_id}        -> 201 run | 404 | 409 run_in_progress
//   GET  /macrocac/runs                    -> {items,total}
//   GET  /macrocac/runs/:runId             -> run; resultado_lote al terminar
//   HEAD/GET /macrocac/runs/:runId/reporte -> xlsx blob | 409 mientras no termine
//
// El mock no parsea multipart/xlsx (express.json() deja el body sin parsear):
// filename/pais/tabla viajan por query string, como eligibility.js. Los nombres
// de archivo que contienen "sin-idato"/"invalid" simulan una planilla sin las
// columnas obligatorias, y "sin-motivo" simula filas con MotivoCambio vacío.
//
// Estado en memoria: uploads por upload_id, runs por run_id, y un índice
// (pais,tabla) -> run activo que respalda la regla de deduplicación.

const router = Router()

// Los 10 del motor canónico (config/countries.json). RD corre sobre CAM_KWP.
export const MACROCAC_COUNTRIES = ["AR", "BO", "BR", "CAM", "RD", "CL", "CO", "EC", "MX", "PE"]

/** país -> base, espejo de COUNTRY_SQL del backend. */
const COUNTRY_DB = {
  AR: "AR_KWP",
  BO: "BO_KWP",
  BR: "BR_KWP",
  CAM: "CAM_KWP",
  RD: "CAM_KWP",
  CL: "CL_KWP",
  CO: "CO_KWP",
  EC: "ECU_KWP",
  MX: "MX_KWP",
  PE: "PE_KWP",
}

// Patrones habilitados (espejo de backend assets/tablas.json). El backend los
// expande contra sys.tables; acá se expanden contra una lista fija por país.
const PATRONES = [
  {
    patron: "_test_*",
    base: null,
    descripcion:
      "Convención acordada con TI: _test_<tabla>_<version>, nombres fijos por base país que se reutilizan",
  },
  {
    patron: "j_atoscompra_new",
    base: null,
    descripcion: "Productiva. La única que lee el motor canónico",
  },
  {
    patron: "j_atoscompra_new_rd",
    base: null,
    descripcion: "Oficial, no es test. Nombre exacto",
  },
]

/** Qué tablas "existen" en la base de cada país (lo que el backend leería de
 *  sys.tables). BO tiene la de Nini; RD suma su tabla oficial. */
function tablasDe(pais) {
  const base = COUNTRY_DB[pais]
  const nombres = [
    "j_atoscompra_new",
    // Convención nueva: nombre fijo + versión, reutilizado período a período.
    "_test_j_atoscompra_new_v1",
    "_test_j_atoscompra_new_v2",
  ]
  if (pais === "RD") nombres.push("j_atoscompra_new_rd")
  return nombres.map((tabla) => ({
    base,
    esquema: "dbo",
    tabla,
    patron: patronDe(tabla),
  }))
}

/** Qué patrón habilitó esta tabla (el backend lo devuelve para poder rastrearlo). */
function patronDe(tabla) {
  return tabla.startsWith("_test_") ? "_test_*" : tabla
}

// Catálogo A_FlgMotivo. 9 filas, idénticas en las bases verificadas. El
// `flg_motivo` es lo que la auditoría guarda; la descripción es la etiqueta.
const MOTIVOS = [
  { flg_motivo: 1, descricao: "EVA" },
  { flg_motivo: 2, descricao: "SmartQuality" },
  { flg_motivo: 3, descricao: "Críticas" },
  { flg_motivo: 4, descricao: "Elegibilidad" },
  { flg_motivo: 5, descricao: "Calibración" },
  { flg_motivo: 6, descricao: "Cuestionamientos" },
  { flg_motivo: 7, descricao: "Reprocesos" },
  { flg_motivo: 8, descricao: "Cambios/Reestructuras MF" },
  { flg_motivo: 9, descricao: "Otros" },
]

// Same knob qms_tr.js uses for fast, deterministic e2e progression.
const STEP_INTERVAL_MS = () => Number(process.env.MOCK_STEP_INTERVAL_MS) || 2000

const CORRECTION_COLUMNS = [
  "IdAto",
  "Flg",
  "MotivoCambio",
  "Motivo_Otros",
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
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
  uploads.clear()
  runs.clear()
  activeRunByKey.clear()
  uploadCounter = 0
}

// ---------------------------------------------------------------------------
// Catálogos (tablas, motivos, plantilla)
// ---------------------------------------------------------------------------

router.get("/macrocac/tablas", (req, res) => {
  const pais = String(req.query.pais || "")
  if (!MACROCAC_COUNTRIES.includes(pais)) {
    return res.status(400).json({ error: "bad_request", message: `País desconocido: '${pais}'.` })
  }
  const items = tablasDe(pais)
  const patrones = PATRONES.map((p) => ({
    ...p,
    coincidencias: items.filter((t) => t.patron === p.patron).length,
  }))
  res.json({ items, pais, patrones })
})

router.get("/macrocac/motivos", (req, res) => {
  const pais = String(req.query.pais || "")
  if (!MACROCAC_COUNTRIES.includes(pais)) {
    return res.status(400).json({ error: "bad_request", message: `País desconocido: '${pais}'.` })
  }
  res.json({ items: MOTIVOS, pais, stale: false, age_seconds: 0 })
})

router.get("/macrocac/plantilla", (_req, res) => {
  const body = Buffer.from("mock plantilla de correcciones PythonCac")
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  res.setHeader("Content-Disposition", 'attachment; filename="plantilla_correcciones.xlsx"')
  res.send(body)
})

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
  const motivo = req.query.motivo ? String(req.query.motivo) : null
  const auxiliar = req.query.auxiliar ? String(req.query.auxiliar) : null

  if (!MACROCAC_COUNTRIES.includes(pais)) {
    return res.status(400).json({ error: "bad_request", message: `País desconocido: '${pais}'.` })
  }
  if (!tablasDe(pais).some((t) => t.tabla === tabla)) {
    return res.status(400).json({
      error: "bad_request",
      message: `Tabla no habilitada: '${tabla}'. No coincide con ningún patrón configurado.`,
    })
  }

  if (/sin-idato|invalid/i.test(filename)) {
    return res.status(422).json({
      error: "missing_columns",
      missing_columns: ["IdAto", "Flg"],
    })
  }

  // Filas con MotivoCambio vacío: el motivo del formulario es su fallback, y
  // sin él el motor abortaría el lote. El backend lo exige solo en ese caso.
  const filasSinMotivo = /sin-motivo/i.test(filename) ? 4 : 0
  if (filasSinMotivo > 0 && !motivo) {
    return res.status(422).json({
      error: "motivo_requerido",
      message: `${filasSinMotivo} filas no traen MotivoCambio. Elige uno para usarlo como fallback.`,
      filas_sin_motivo: filasSinMotivo,
    })
  }

  const flgMotivo = motivo ? Number(motivo) : null
  const filas = 14
  // Desglose por motivo, de más a menos filas. Las filas sin motivo propio se
  // cuentan bajo el del formulario, que es el que van a terminar usando.
  const motivosResumen =
    filasSinMotivo > 0
      ? [
          { flg_motivo: flgMotivo, descricao: motivoCambioLabel(flgMotivo), filas: filas - 4 + filasSinMotivo },
          { flg_motivo: 2, descricao: "SmartQuality", filas: 4 - filasSinMotivo + 4 },
        ].filter((m) => m.filas > 0)
      : [
          { flg_motivo: 5, descricao: "Calibración", filas: 9 },
          { flg_motivo: 2, descricao: "SmartQuality", filas: 5 },
        ]

  uploadCounter += 1
  const uploadId = `upl_macrocac_${uploadCounter}`
  const upload = {
    upload_id: uploadId,
    filename,
    pais,
    tabla,
    motivo,
    flg_motivo: flgMotivo,
    auxiliar: auxiliar,
    filas,
    columnas: CORRECTION_COLUMNS,
    motivos_resumen: motivosResumen,
    filas_sin_motivo: filasSinMotivo,
    filas_con_auxiliar: 3,
  }
  uploads.set(uploadId, upload)
  res.status(201).json(upload)
})

function motivoCambioLabel(flgMotivo) {
  return MOTIVOS.find((m) => m.flg_motivo === flgMotivo)?.descricao ?? "Otros"
}

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
  const { upload_id: uploadId, per_ini: perIni, per_fin: perFin } = req.body || {}
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
    // El motor real aplica y confirma; el mock imita ese contrato, no un
    // dry-run que no existe.
    dry_run: false,
    pais: upload.pais,
    tabla: upload.tabla,
    upload_id: upload.upload_id,
    per_ini: perIni ?? null,
    per_fin: perFin ?? null,
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
  if (!run) {
    return res
      .status(404)
      .json({ error: "not_found", message: `Run '${req.params.runId}' no encontrado.` })
  }
  res.json(serializeRun(run))
})

function reportBuffer(run, suffix) {
  return Buffer.from(
    `mock macrocac report for ${run.pais}/${run.tabla} run=${run.run_id} (${suffix || "reporte"})`,
  )
}

/** El reporte solo existe una vez terminado el run: antes es 409, que es lo que
 *  la UI usa para no ofrecer la descarga. La UI hace HEAD antes de navegar, así
 *  que ambos verbos tienen que responder igual. */
function serveReporte(suffix) {
  return (req, res) => {
    const run = runs.get(req.params.runId)
    if (!run) {
      return res
        .status(404)
        .json({ error: "not_found", message: `Run '${req.params.runId}' no encontrado.` })
    }
    if (run.status !== "succeeded") {
      return res.status(409).json({
        error: "run_not_finished",
        message: `El run '${run.run_id}' todavía no termina (status: ${run.status}).`,
      })
    }
    const body = reportBuffer(run, suffix)
    // Los nombres son los que escribe el motor canónico: reporte_<pais>.xlsx y
    // reporte_<pais>_diff.xlsx.
    const pais = run.pais.toLowerCase()
    const nombre = suffix === "reporte-diff" ? `reporte_${pais}_diff.xlsx` : `reporte_${pais}.xlsx`
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`)
    res.setHeader("Content-Length", String(body.length))
    // HEAD no lleva cuerpo: express corta el body solo, pero los headers ya
    // están puestos y eso es lo que la sonda de la UI mira.
    res.send(body)
  }
}

router.get("/macrocac/runs/:runId/reporte", serveReporte("reporte"))
router.head("/macrocac/runs/:runId/reporte", serveReporte("reporte"))
router.get("/macrocac/runs/:runId/reporte-diff", serveReporte("reporte-diff"))

export default router

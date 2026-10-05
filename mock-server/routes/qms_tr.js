import { Router } from "express"
import crypto from "crypto"

/**
 * QMS-TR (JAA-1401) — mock del contrato de ms-process-api routes/qms_tr.py (JAA-1400).
 *
 * - GET  /qms_tr/snapshots/resolve?country&at   snapshot de J siguiente al instante (ciclos CDC hh:08, 06..19 Chile)
 * - POST /qms_tr/runs {country, at, mes_procesamiento, productos?}
 *        snapshot listo -> running; si no -> waiting_snapshot, que "aparece" a los MOCK_QMSTR_WAIT_MS
 * - GET  /qms_tr/runs, /qms_tr/runs/:id ; POST /qms_tr/runs/:id/cancel
 * - GET  /qms_tr/runs/:id/download-url -> /download-signed (zip sintético)
 * - POST /qms_tr/runs/:id/validate -> resultado sintético (parcial)
 */
const router = Router()

const STEP_INTERVAL_MS = () => Number(process.env.MOCK_STEP_INTERVAL_MS) || 2000
const WAIT_MS = () => Number(process.env.MOCK_QMSTR_WAIT_MS) || 3 * STEP_INTERVAL_MS()
const PASOS = ["silver_builder", "panelistas", "prep", "motor_grandes", "motor_normales", "entrega"]
/** Pasos que el job excluye (condition_task sin lotes grandes): terminan "cancelled" como en Databricks. */
const EXCLUIDOS = new Set(["motor_grandes"])
const ACTIVOS = new Set(["waiting_snapshot", "pending", "running"])
const PAISES = new Set(["bolivia", "brasil", "cam", "chile", "colombia", "ecuador", "mexico", "peru"])
const TZ = "America/Santiago"

const isoNow = () => new Date().toISOString()

function horaChile(date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", hour: "2-digit", minute: "2-digit" })
      .formatToParts(date).filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]),
  )
  return p.hour + p.minute / 60
}

/** Primer ciclo del CDC (hh:00 Chile, 06..19) que empieza en o después de `at`. */
function proximoCiclo(at) {
  let t = new Date(Math.ceil(at.getTime() / 3_600_000) * 3_600_000)
  for (let i = 0; i < 48; i++, t = new Date(t.getTime() + 3_600_000)) {
    const h = horaChile(t)
    if (h >= 6 && h <= 19) return t
  }
  throw new Error("sin ciclo CDC en 48 h")
}

function resolver(country, atIso) {
  const at = new Date(atIso)
  const ciclo = proximoCiclo(at)
  const commit = new Date(ciclo.getTime() + 8 * 60_000)
  const listo = commit.getTime() <= Date.now()
  const version = Math.floor(commit.getTime() / 3_600_000) % 100_000
  const fqn = (t) => `000-sql-databricks-bridge.${country}.${t}`
  if (!listo) {
    const warnings = []
    if (new Date(ciclo).toDateString() !== at.toDateString() && horaChile(at) > 19) {
      warnings.push("No hay más ciclos del CDC de J ese día: el siguiente snapshot es el de las 06:00.")
    }
    return { status: "waiting", at: at.toISOString(), j: null, tables: [], expected_j_at: ciclo.toISOString(), warnings }
  }
  const j = { table: "j_atoscompra_new", table_fqn: fqn("j_atoscompra_new"), version, timestamp: commit.toISOString() }
  const dims = ["a_canal", "hato_cabecalho", "rg_domicilios_pesos", "rg_panelis", "vw_artigoz", "vw_venues"].map(
    (t, i) => ({ table: t, table_fqn: fqn(t), version: 100 + i, timestamp: new Date(commit.getTime() - 6 * 3_600_000).toISOString() }),
  )
  return { status: "ready", at: at.toISOString(), j, tables: [j, ...dims], expected_j_at: null, warnings: [] }
}

/** @type {Map<string, object>} */
export const qmsTrJobs = new Map()
/** @type {Map<string, NodeJS.Timeout>} */
const timers = new Map()

export function resetQmsTrJobs() {
  for (const t of timers.values()) clearInterval(t)
  timers.clear()
  qmsTrJobs.clear()
}

function publico(run) {
  return Object.fromEntries(Object.entries(run).filter(([k]) => !k.startsWith("_")))
}

function arrancar(run) {
  run.status = "running"
  run.started_at = isoNow()
  run.run_tag = `${run.country}_${run.mes_procesamiento}_${run.run_id.replace(/-/g, "").slice(0, 10)}`
  run.databricks_run_id = String(Math.floor(Math.random() * 1e15))
  run.run_page_url = `https://adb-mock.azuredatabricks.net/#job/476494422826160/run/${run.databricks_run_id}`
  const timer = setInterval(() => avanzar(run.run_id), STEP_INTERVAL_MS())
  timers.set(run.run_id, timer)
}

function terminar(run, status, error) {
  run.status = status
  run.completed_at = isoNow()
  run.current_step = null
  if (error) run.error_message = error
  clearInterval(timers.get(run.run_id))
  timers.delete(run.run_id)
}

function avanzar(runId) {
  const run = qmsTrJobs.get(runId)
  if (!run || run.status !== "running") return
  const paso = run.steps.find((s) => s.status === "pending" || s.status === "running")
  if (!paso) return terminar(run, "completed")
  if (EXCLUIDOS.has(paso.name)) {
    paso.status = "cancelled"
    return avanzar(runId)
  }
  if (paso.status === "pending") {
    paso.status = "running"
    paso.started_at = isoNow()
    run.current_step = paso.name
    return
  }
  const falla = run._forceOutcome === "fail" && paso.name === (run._failAtStep ?? "prep")
  paso.completed_at = isoNow()
  if (falla) {
    paso.status = "failed"
    paso.error = `El paso ${paso.name} falló (simulado)`
    return terminar(run, "failed", `Falló el paso ${paso.name}`)
  }
  paso.status = "completed"
  if (!run.steps.some((s) => s.status === "pending")) terminar(run, "completed")
}

function error(res, status, errorCode, message, extra = {}) {
  return res.status(status).json({ error: errorCode, message, ...extra })
}

router.get("/qms_tr/snapshots/resolve", (req, res) => {
  const { country, at } = req.query
  if (!country || !at) return error(res, 422, "validation_error", "country y at son obligatorios")
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(String(at))) return error(res, 422, "at_sin_zona", "El instante debe traer zona horaria")
  if (!PAISES.has(String(country))) return error(res, 422, "snapshot_invalido", `País sin QMS-TR: ${country}`)
  res.json(resolver(String(country), String(at)))
})

router.post("/qms_tr/runs", (req, res) => {
  const { country, at, mes_procesamiento, productos = [], force_outcome, fail_at_step } = req.body ?? {}
  if (!country || !at || !/^\d{6}$/.test(mes_procesamiento ?? "")) {
    return error(res, 422, "validation_error", "country, at y mes_procesamiento (AAAAMM) son obligatorios")
  }
  if (!PAISES.has(country)) return error(res, 404, "not_found", `No hay job qms_tr_run configurado para '${country}'`)
  const activa = [...qmsTrJobs.values()].find(
    (r) => r.country === country && r.mes_procesamiento === mes_procesamiento && ACTIVOS.has(r.status),
  )
  if (activa) {
    return error(res, 409, "conflict", `Ya hay una corrida en curso para ${country} ${mes_procesamiento}`, { run_id: activa.run_id })
  }
  const snapshot = resolver(country, at)
  const run = {
    run_id: crypto.randomUUID(), country, at: new Date(at).toISOString(), mes_procesamiento, productos,
    status: "pending", current_step: null,
    steps: PASOS.map((name) => ({ name, status: "pending", started_at: null, completed_at: null, error: null })),
    snapshot, run_tag: null, databricks_run_id: null, run_page_url: null, started_at: null, completed_at: null,
    created_by: "dev@wp.numerator.com", created_at: isoNow(), updated_at: isoNow(), error_message: null,
    validacion: null, _forceOutcome: force_outcome, _failAtStep: fail_at_step,
  }
  qmsTrJobs.set(run.run_id, run)
  if (snapshot.status === "ready") {
    arrancar(run)
  } else {
    run.status = "waiting_snapshot"
    // el ciclo del CDC "ocurre": se re-resuelve con un snapshot ya listo y la corrida parte sola
    const t = setTimeout(() => {
      if (run.status !== "waiting_snapshot") return
      run.snapshot = resolver(country, new Date(Date.now() - 2 * 3_600_000).toISOString())
      arrancar(run)
    }, WAIT_MS())
    timers.set(run.run_id, t)
  }
  res.status(201).json(publico(run))
})

router.get("/qms_tr/runs", (req, res) => {
  const { country } = req.query
  const items = [...qmsTrJobs.values()]
    .filter((r) => !country || r.country === country)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(publico)
  res.json({ items, total: items.length, limit: 100, offset: 0 })
})

router.get("/qms_tr/runs/:runId", (req, res) => {
  const run = qmsTrJobs.get(req.params.runId)
  if (!run) return error(res, 404, "not_found", `Run ${req.params.runId} not found`)
  res.json(publico(run))
})

router.post("/qms_tr/runs/:runId/cancel", (req, res) => {
  const run = qmsTrJobs.get(req.params.runId)
  if (!run) return error(res, 404, "not_found", `Run ${req.params.runId} not found`)
  if (!ACTIVOS.has(run.status)) return error(res, 409, "conflict", `No se puede cancelar una corrida en estado "${run.status}"`)
  clearInterval(timers.get(run.run_id))
  clearTimeout(timers.get(run.run_id))
  timers.delete(run.run_id)
  for (const s of run.steps) if (s.status === "running" || s.status === "pending") s.status = "cancelled"
  run.status = "cancelled"
  run.completed_at = isoNow()
  run.error_message = "Cancelada por el usuario"
  res.json(publico(run))
})

router.get("/qms_tr/runs/:runId/download-url", (req, res) => {
  const run = qmsTrJobs.get(req.params.runId)
  if (!run) return error(res, 404, "not_found", `Run ${req.params.runId} not found`)
  if (run.status !== "completed") return error(res, 409, "conflict", `Los resultados no están listos (estado "${run.status}")`)
  res.json({ url: `/api/v1/qms_tr/runs/${run.run_id}/download-signed?token=mock`, expires_in: 60 })
})

router.get("/qms_tr/runs/:runId/download-signed", (req, res) => {
  const run = qmsTrJobs.get(req.params.runId)
  if (!run || !req.query.token) return error(res, 401, "unauthorized", "token inválido")
  const nombre = `qms_tr_${run.country}_${run.run_tag}.zip`
  res.setHeader("Content-Type", "application/zip")
  res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`)
  res.send(Buffer.from(`QMS-TR mock ${run.run_tag}\n`))
})

router.post("/qms_tr/runs/:runId/validate", (req, res) => {
  const run = qmsTrJobs.get(req.params.runId)
  if (!run) return error(res, 404, "not_found", `Run ${req.params.runId} not found`)
  if (run.status !== "completed") return error(res, 409, "conflict", `Solo se valida una corrida completada (estado "${run.status}")`)
  const hoja = (total, checked, applied, pending, mismatched) => ({ total, checked, applied, pending, mismatched })
  run.validacion = {
    status: "parcial", validated_at: isoNow(), validated_by: "dev@wp.numerator.com",
    checked: 12, applied: 10, pending: 1, mismatched: 1,
    by_sheet: {
      imputaciones: hoja(212, 3, 3, 0, 0), cantidad_envasados: hoja(7, 3, 3, 0, 0),
      factores: hoja(255, 3, 1, 1, 1), exclusiones: hoja(90, 3, 3, 0, 0),
    },
    rows: [
      { sheet: "Factores", id_ato: 1001, id_produto: 29, variable: "FACTOR_RW1", esperado: 150, actual: 150, anterior: 100, resultado: "aplicado" },
      { sheet: "Factores", id_ato: 1002, id_produto: 29, variable: "FACTOR_RW1", esperado: 80, actual: 100, anterior: 100, resultado: "pendiente" },
      { sheet: "Factores", id_ato: 1003, id_produto: 22, variable: "FACTOR_RW1", esperado: 90, actual: 42, anterior: 100, resultado: "distinto" },
    ],
  }
  run.updated_at = isoNow()
  res.json(publico(run))
})

export default router

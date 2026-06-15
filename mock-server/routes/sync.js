import { Router } from "express"
import crypto from "crypto"
import { Readable } from "node:stream"

const router = Router()

// ---------------------------------------------------------------------------
// Country metadata (shared)
// ---------------------------------------------------------------------------

export const COUNTRIES = [
  { code: "argentina", queries: ["j_atoscompra_new", "hato_cabecalho", "productos", "clientes", "region_kantar", "canales"], queries_count: 6 },
  { code: "bolivia", queries: ["j_atoscompra_new", "hato_cabecalho", "productos", "clientes", "canales"], queries_count: 5 },
  { code: "brasil", queries: ["j_atoscompra_new", "hato_cabecalho", "produtos", "clientes", "region_kantar", "canales", "categorias"], queries_count: 7 },
  { code: "cam", queries: ["j_atoscompra_new", "hato_cabecalho", "productos", "clientes", "canales"], queries_count: 5 },
  { code: "chile", queries: ["j_atoscompra_new", "hato_cabecalho", "productos", "clientes", "region_kantar", "canales"], queries_count: 6 },
  { code: "colombia", queries: ["j_atoscompra_new", "hato_cabecalho", "productos", "clientes", "region_kantar", "canales"], queries_count: 6 },
  { code: "ecuador", queries: ["j_atoscompra_new", "hato_cabecalho", "productos", "clientes", "canales"], queries_count: 5 },
  { code: "mexico", queries: ["j_atoscompra_new", "hato_cabecalho", "productos", "clientes", "region_kantar", "canales", "categorias"], queries_count: 7 },
  { code: "peru", queries: ["j_atoscompra_new", "hato_cabecalho", "productos", "clientes", "region_kantar", "canales"], queries_count: 6 },
]

// ---------------------------------------------------------------------------
// Calibration pipeline steps
// ---------------------------------------------------------------------------

const CALIBRATION_STEPS = ["sync_data", "copy_to_calibration", "merge_data", "simulate_kpis", "calculate_penetration", "download_csv"]

const STEP_TASKS = {
  merge_data: [{ task_key: "Merge Data" }, { task_key: "Simulate KPIs" }, { task_key: "Calculate Penetration" }],
}

function makeSteps(status = "pending") {
  return CALIBRATION_STEPS.map(name => ({
    name, status, started_at: null, completed_at: null, error: null,
    tasks: (STEP_TASKS[name] || []).map(t => ({ task_key: t.task_key, status: "pending", started_at: null, completed_at: null, error: null })),
  }))
}

function makeCompletedSteps(baseTime) {
  let cursor = new Date(baseTime).getTime()
  return CALIBRATION_STEPS.map(name => {
    const started = new Date(cursor).toISOString()
    cursor += Math.floor(Math.random() * 8000) + 2000
    const completed = new Date(cursor).toISOString()
    cursor += 500
    return { name, status: "completed", started_at: started, completed_at: completed, error: null }
  })
}

function makeFailedSteps(baseTime, failAtIndex) {
  let cursor = new Date(baseTime).getTime()
  return CALIBRATION_STEPS.map((name, i) => {
    if (i > failAtIndex) return { name, status: "pending", started_at: null, completed_at: null, error: null }
    const started = new Date(cursor).toISOString()
    cursor += Math.floor(Math.random() * 5000) + 1000
    if (i === failAtIndex) return { name, status: "failed", started_at: started, completed_at: new Date(cursor).toISOString(), error: `Step "${name}" failed: simulated error` }
    const completed = new Date(cursor).toISOString()
    cursor += 500
    return { name, status: "completed", started_at: started, completed_at: completed, error: null }
  })
}

const uuid = () => crypto.randomUUID()
const isoNow = () => new Date().toISOString()

// ---------------------------------------------------------------------------
// In-memory job store
// ---------------------------------------------------------------------------

/** @type {Map<string, object>} */
export const jobs = new Map()

function enrichSummary(job) {
  const { results, _stepIndex, ...base } = job
  const running_queries = (results || []).filter(r => r.status === "running").map(r => r.query_name)
  const failed_queries = (results || []).filter(r => r.status === "failed").map(r => r.query_name)
  return { ...base, current_query: running_queries[0] || null, failed_queries, running_queries, queries_running: running_queries.length, total_rows_extracted: (results || []).reduce((s, r) => s + (r.rows_extracted || 0), 0) }
}

// ---------------------------------------------------------------------------
// Seed helpers (exported for fixtures/seed.js)
// ---------------------------------------------------------------------------

export function seedCompletedJob(country, stage, period, daysAgo) {
  const countryMeta = COUNTRIES.find(c => c.code === country)
  const queries = countryMeta ? countryMeta.queries : ["j_atoscompra_new", "productos"]
  const jobId = uuid()
  const created = new Date(Date.now() - daysAgo * 86400000).toISOString()
  const started = new Date(new Date(created).getTime() + 2000).toISOString()
  const completed = new Date(new Date(started).getTime() + 30000 + Math.floor(Math.random() * 60000)).toISOString()
  const results = queries.map(q => ({ query_name: q, status: "completed", rows_extracted: Math.floor(Math.random() * 50000) + 1000, table_name: `kpi_prd_01.bridge.${country}_${q}`, duration_seconds: +(Math.random() * 30 + 2).toFixed(2), error: null, started_at: started }))
  jobs.set(jobId, { job_id: jobId, status: "completed", country, stage, period, tag: `${country}-${stage}-seed`, queries_total: queries.length, queries_completed: queries.length, queries_failed: 0, created_at: created, started_at: started, completed_at: completed, triggered_by: "system-seed", error: null, results, steps: makeCompletedSteps(started), current_step: null })
}

export function seedFailedJob(country, stage, period, daysAgo) {
  const countryMeta = COUNTRIES.find(c => c.code === country)
  const queries = countryMeta ? countryMeta.queries : ["j_atoscompra_new"]
  const jobId = uuid()
  const created = new Date(Date.now() - daysAgo * 86400000).toISOString()
  const failedStarted = new Date(new Date(created).getTime() + 1000).toISOString()
  const results = queries.map((q, i) => {
    if (i === queries.length - 1) return { query_name: q, status: "failed", rows_extracted: 0, table_name: null, duration_seconds: +(Math.random() * 5).toFixed(2), error: "Timeout: query exceeded 300s limit", started_at: failedStarted }
    return { query_name: q, status: "completed", rows_extracted: Math.floor(Math.random() * 10000) + 500, table_name: `kpi_prd_01.bridge.${country}_${q}`, duration_seconds: +(Math.random() * 20 + 1).toFixed(2), error: null, started_at: failedStarted }
  })
  const failStepIndex = Math.min(2, CALIBRATION_STEPS.length - 1)
  jobs.set(jobId, { job_id: jobId, status: "failed", country, stage, period, tag: `${country}-${stage}-seed`, queries_total: queries.length, queries_completed: queries.length - 1, queries_failed: 1, created_at: created, started_at: failedStarted, completed_at: new Date(new Date(created).getTime() + 45000).toISOString(), triggered_by: "system-seed", error: "1 query failed", results, steps: makeFailedSteps(failedStarted, failStepIndex), current_step: null })
}

export function resetJobs() {
  jobs.clear()
}

// ---------------------------------------------------------------------------
// Job progression (kept as-is from original)
// ---------------------------------------------------------------------------

function advanceJob(jobId) {
  const job = jobs.get(jobId)
  if (!job || job.status === "completed" || job.status === "failed" || job.status === "cancelled") return
  if (job.status === "pending") {
    job.status = "running"; job.started_at = isoNow()
    if (job.steps?.length > 0) { const fp = job.steps.find(s => s.status === "pending"); if (fp) { fp.status = "running"; fp.started_at = isoNow(); job.current_step = fp.name } }
  }
  if (!job.steps) return
  const stepIdx = job._stepIndex ?? 0
  if (stepIdx >= job.steps.length) return
  const step = job.steps[stepIdx]

  if (step.name === "sync_data") {
    if (step.status === "pending") { step.status = "running"; step.started_at = isoNow(); job.current_step = step.name }
    const pendingQ = job.results.filter(r => r.status === "pending")
    if (pendingQ.length > 0) {
      const next = pendingQ[0]; next.started_at = isoNow()
      if (Math.random() < 0.1) { next.status = "failed"; next.rows_extracted = 0; next.duration_seconds = +(Math.random() * 3).toFixed(2); next.error = "Simulated query failure"; job.queries_failed++ } else { next.status = "completed"; next.rows_extracted = Math.floor(Math.random() * 40000) + 500; next.table_name = `kpi_prd_01.bridge.${job.country}_${next.query_name}`; next.duration_seconds = +(Math.random() * 15 + 1).toFixed(2) }
      job.queries_completed++; return
    }
    if (job.queries_failed > 0) { step.status = "failed"; step.completed_at = isoNow(); step.error = `${job.queries_failed} query(ies) failed during sync`; job.status = "failed"; job.completed_at = isoNow(); job.current_step = null; job.error = `Pipeline failed at step: sync_data (${job.queries_failed} query failures)`; return }
    step.status = "completed"; step.completed_at = isoNow(); job._stepIndex = stepIdx + 1
    if (stepIdx + 1 < job.steps.length) { job.steps[stepIdx + 1].status = "running"; job.steps[stepIdx + 1].started_at = isoNow(); job.current_step = job.steps[stepIdx + 1].name }
    return
  }

  if (step.status === "pending") { step.status = "running"; step.started_at = isoNow(); job.current_step = step.name; if (step.tasks?.length > 0) { step.tasks[0].status = "running"; step.tasks[0].started_at = isoNow() }; return }
  if (step.status === "running") {
    if (Math.random() < 0.05) { step.status = "failed"; step.completed_at = isoNow(); step.error = `Step "${step.name}" failed: simulated error`; for (const t of step.tasks || []) { if (t.status === "running") { t.status = "failed"; t.completed_at = isoNow(); t.error = "Parent step failed" } }; job.current_step = null; job.status = "failed"; job.completed_at = isoNow(); job.error = `Pipeline failed at step: ${step.name}`; return }
    if (step.tasks?.length > 0) {
      const rt = step.tasks.find(t => t.status === "running")
      if (rt) {
        rt.status = "completed"; rt.completed_at = isoNow()
        const taskIdx = step.tasks.indexOf(rt); const mapped = job.steps[stepIdx + taskIdx]
        if (mapped && (mapped.status === "pending" || mapped.status === "running")) { mapped.status = "completed"; if (!mapped.started_at) mapped.started_at = isoNow(); mapped.completed_at = isoNow() }
        const nt = step.tasks.find(t => t.status === "pending")
        if (nt) { nt.status = "running"; nt.started_at = isoNow(); const nti = step.tasks.indexOf(nt); const nm = job.steps[stepIdx + nti]; if (nm?.status === "pending") { nm.status = "running"; nm.started_at = isoNow(); job.current_step = nm.name }; job._stepIndex = stepIdx + nti; return }
        const tc = step.tasks.length; const nsi = stepIdx + tc; job._stepIndex = nsi
        if (nsi < job.steps.length) { job.steps[nsi].status = "running"; job.steps[nsi].started_at = isoNow(); job.current_step = job.steps[nsi].name } else { job.status = "completed"; job.completed_at = isoNow(); job.current_step = null }
        return
      }
    }
    step.status = "completed"; step.completed_at = isoNow(); job._stepIndex = stepIdx + 1
    if (stepIdx + 1 < job.steps.length) { job.steps[stepIdx + 1].status = "running"; job.steps[stepIdx + 1].started_at = isoNow(); job.current_step = job.steps[stepIdx + 1].name } else { job.status = "completed"; job.completed_at = isoNow(); job.current_step = null }
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.post("/trigger", (req, res) => {
  const { country, stage, period, queries: requestedQueries, aggregations, row_limit, lookback_months, skip_sync, skip_copy } = req.body
  if (!country || !stage) return res.status(400).json({ error: "bad_request", message: "country and stage are required" })
  const countryMeta = COUNTRIES.find(c => c.code === country)
  if (!countryMeta) return res.status(404).json({ error: "not_found", message: `Unknown country: ${country}` })
  const queryList = requestedQueries ?? countryMeta.queries
  const jobId = uuid(); const now = isoNow()
  const results = queryList.map(q => ({ query_name: q, status: "pending", rows_extracted: 0, table_name: null, duration_seconds: 0, error: null, started_at: null }))
  const job = { job_id: jobId, status: "pending", country, stage, period: period ?? null, tag: `${country}-${stage}-${Date.now()}`, queries_total: queryList.length, queries_completed: 0, queries_failed: 0, created_at: now, started_at: null, completed_at: null, triggered_by: "calibration-app", aggregations: aggregations ?? null, error: null, results, steps: makeSteps(), current_step: "sync_data", _stepIndex: 0 }
  if (skip_sync) { job.steps[0].status = "completed"; job.steps[0].started_at = isoNow(); job.steps[0].completed_at = isoNow(); job._stepIndex = 1; for (const r of job.results) { r.status = "completed"; r.rows_extracted = Math.floor(Math.random() * 40000) + 500; r.table_name = `kpi_prd_01.bridge.${country}_${r.query_name}`; r.duration_seconds = 0; r.started_at = isoNow() }; job.queries_completed = queryList.length; job.current_step = "copy_to_calibration" }
  if (skip_copy) { job.steps[1].status = "completed"; job.steps[1].started_at = isoNow(); job.steps[1].completed_at = isoNow(); for (const t of job.steps[1].tasks || []) { t.status = "completed"; if (!t.started_at) t.started_at = isoNow(); t.completed_at = isoNow() }; job._stepIndex = 2; job.steps[2].status = "running"; job.steps[2].started_at = isoNow(); job.current_step = job.steps[2].name; if (job.steps[2].tasks?.length > 0) { job.steps[2].tasks[0].status = "running"; job.steps[2].tasks[0].started_at = isoNow() } }
  jobs.set(jobId, job)
  let tick = 0; const maxTicks = queryList.length + 1 + 2 + 4 + 2 + 5
  const interval = setInterval(() => { advanceJob(jobId); tick++; const c = jobs.get(jobId); if (!c || c.status === "completed" || c.status === "failed" || c.status === "cancelled" || tick >= maxTicks) clearInterval(interval) }, 2000)
  res.status(201).json({ job_id: jobId, status: "pending", country, stage, period: period ?? null, tag: job.tag, queries: queryList, queries_count: queryList.length, created_at: now, triggered_by: "calibration-app" })
})

router.get("/events", (req, res) => {
  const { country, status, stage, period, limit: ls, offset: os } = req.query
  const limit = parseInt(ls, 10) || 50; const offset = parseInt(os, 10) || 0
  let items = Array.from(jobs.values()).map(enrichSummary)
  if (country) items = items.filter(j => j.country === country)
  if (status) items = items.filter(j => j.status === status)
  if (stage) items = items.filter(j => j.stage === stage)
  if (period) items = items.filter(j => j.period === period)
  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  res.json({ items: items.slice(offset, offset + limit), total: items.length, limit, offset })
})

router.get("/events/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId)
  if (!job) return res.status(404).json({ error: "not_found", message: `Job ${req.params.jobId} not found` })
  res.json({ ...enrichSummary(job), results: job.results })
})

// GET /events/:jobId/tables → TablesResponse { job_id, country, tables: TableInfo[] }
// Derived from the job's completed query results (table_name = catalog.schema.table).
router.get("/events/:jobId/tables", (req, res) => {
  const job = jobs.get(req.params.jobId)
  if (!job) return res.status(404).json({ error: "not_found", message: `Job ${req.params.jobId} not found` })
  const tables = (job.results || [])
    .filter(r => r.status === "completed" && r.table_name)
    .map(r => {
      const parts = r.table_name.split(".")
      const catalog = parts[0] ?? "kpi_prd_01"
      const schema_name = parts[1] ?? "bridge"
      const table_name = parts.slice(2).join(".") || r.table_name
      return { full_name: r.table_name, catalog, schema_name, table_name }
    })
  res.json({ job_id: job.job_id, country: job.country, tables })
})

router.post("/events/:jobId/cancel", (req, res) => {
  const job = jobs.get(req.params.jobId)
  if (!job) return res.status(404).json({ error: "not_found", message: `Job ${req.params.jobId} not found` })
  if (["completed", "failed", "cancelled"].includes(job.status)) return res.status(409).json({ error: "conflict", message: `Job is already ${job.status}` })
  job.status = "cancelled"; job.completed_at = isoNow(); job.current_step = null; job.error = "Cancelled by user"
  if (job.steps) for (const s of job.steps) { if (s.status === "running") { s.status = "failed"; s.completed_at = isoNow(); s.error = "Cancelled by user" } }
  if (job.results) for (const r of job.results) { if (r.status === "pending" || r.status === "running") { r.status = "failed"; r.error = "Cancelled by user" } }
  res.json({ ...enrichSummary(job), results: job.results })
})

// Build the small job-report CSV (used when no specific ?table is requested).
function buildJobReport(job) {
  const lines = ["# Calibration Job Report", `job_id,${job.job_id}`, `country,${job.country}`, `stage,${job.stage}`, `period,${job.period || ""}`, `tag,${job.tag}`, `status,${job.status}`, `triggered_by,${job.triggered_by}`, `started_at,${job.started_at || ""}`, `completed_at,${job.completed_at || ""}`, `error,${job.error || ""}`, "", "# Pipeline Steps", "step_name,status,started_at,completed_at,duration_seconds,error"]
  if (job.steps) for (const s of job.steps) { let d = ""; if (s.started_at && s.completed_at) d = ((new Date(s.completed_at) - new Date(s.started_at)) / 1000).toFixed(2); lines.push(`${s.name},${s.status},${s.started_at || ""},${s.completed_at || ""},${d},${s.error || ""}`) }
  lines.push("", "# Query Results", "query_name,status,rows_extracted,table_name,duration_seconds,error")
  if (job.results) for (const r of job.results) lines.push(`${r.query_name},${r.status},${r.rows_extracted},${r.table_name || ""},${(r.duration_seconds || 0).toFixed(2)},${r.error || ""}`)
  return lines.join("\n")
}

// Deterministic pseudo-random in [0,1) from an integer seed — keeps row data
// stable across requests without Math.random (mirrors a real extract).
function seeded(n) { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x) }

// A Readable that lazily emits a header + `rowCount` CSV data rows for a bridge
// table, batching rows per read() so memory stays flat regardless of row count.
// This mirrors the real API's StreamingResponse generator (constant-memory,
// chunked transfer) instead of buffering the whole file in one res.send().
function tableCsvStream(table, period, rowCount, batchSize = 2000) {
  const channels = ["Hypermarket", "Supermarket", "Discounter", "Traditional", "Convenience", "Online"]
  const header = "row_id,period,product_id,client_id,channel,units,value\n"
  let emitted = 0
  let sentHeader = false
  return new Readable({
    read() {
      if (!sentHeader) { this.push(header); sentHeader = true; return }
      if (emitted >= rowCount) { this.push(null); return }
      const end = Math.min(emitted + batchSize, rowCount)
      let buf = ""
      for (let i = emitted; i < end; i++) {
        const productId = 100000 + Math.floor(seeded(i + 1) * 900000)
        const clientId = 1000 + Math.floor(seeded(i + 7) * 9000)
        const channel = channels[Math.floor(seeded(i + 13) * channels.length)]
        const units = 1 + Math.floor(seeded(i + 17) * 500)
        const value = (seeded(i + 23) * 10000).toFixed(2)
        buf += `${i + 1},${period},${productId},${clientId},${channel},${units},${value}\n`
      }
      emitted = end
      this.push(buf)
    },
  })
}

router.get("/events/:jobId/download", (req, res) => {
  const job = jobs.get(req.params.jobId)
  if (!job) return res.status(404).json({ error: "not_found", message: `Job ${req.params.jobId} not found` })
  if (job.status !== "completed" && job.status !== "failed") return res.status(409).json({ error: "job_not_finished", message: `Job is still ${job.status}` })

  const { table } = req.query
  if (table) {
    // Stream the extracted rows for a single table. 404 if the job has no such
    // completed table, so the contract matches the real backend.
    const result = (job.results || []).find(r => r.table_name === table && r.status === "completed")
    if (!result) return res.status(404).json({ error: "not_found", message: `Table ${table} not found for job ${req.params.jobId}` })
    const rowCount = result.rows_extracted || 0
    // table_name leaf already includes the country (e.g. "argentina_productos"),
    // so use it as-is to avoid a doubled-country filename.
    const tableLeaf = String(table).split(".").pop()
    const filename = `${tableLeaf}_${job.period || "no-period"}.csv`
    res.setHeader("Content-Type", "text/csv")
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    // No Content-Length → Express uses chunked transfer-encoding (true streaming).
    const stream = tableCsvStream(table, job.period || "", rowCount)
    stream.on("error", () => { if (!res.headersSent) res.status(500).end(); else res.destroy() })
    res.on("close", () => stream.destroy()) // stop generating if client disconnects
    return stream.pipe(res)
  }

  // No table specified → small job-report summary (unchanged behavior).
  const filename = `calibration_${job.country}_${job.period || "no-period"}_${job.job_id.slice(0, 8)}.csv`
  res.setHeader("Content-Type", "text/csv"); res.setHeader("Content-Disposition", `attachment; filename="${filename}"`); res.send(buildJobReport(job))
})

export default router

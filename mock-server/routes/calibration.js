import { Router } from "express"
import { jobs, enrichSummary } from "./sync.js"
import { buildMockZip } from "../lib/zip.js"
import { issueDownloadToken, validateDownloadToken } from "../lib/download-tokens.js"

const router = Router()

// -- Versiones de J (JAA-1116) ------------------------------------------------
// Mismos datos que siembra el backend real (config/j_versions_seed.json), pero
// recortados a lo que necesita el e2e: chile y bolivia, con el par duplicado ya
// colapsado. Los números son reales, medidos contra 001-calibration-3-0.

// Tablas bronze del pipeline por país (JAA-1121). Espejo de PIPELINE_TABLES en
// api/src/ms_process_api/j_versions_store.py, que a su vez replica el
// BRONZE_TABLE_MAP de KWP-IntelligenceCalibration.
//
// Los snapshots nuevos se fijan en el bridge `000-sql-databricks-bridge.<país>`
// (el input tal como llegó de SQL Server); los registros históricos apuntan a
// `001-calibration-3-0.bronze_<país>`, que es contra lo que se midieron. Las dos
// convenciones conviven: el FQN va por tabla.
const PIPELINE_TABLES = {
  chile: ["a_canal", "grupo", "hato_cabecalho", "j_atoscompra_new", "mordom",
          "rg_domicilios_pesos", "rg_panelis", "rg_pets", "vw_artigoz", "vw_venues"],
  bolivia: ["a_canal", "cidade", "hato_cabecalho", "j_atoscompra_new", "mordom",
            "rg_domicilios_pesos", "rg_panelis", "vw_artigoz", "vw_venues"],
}

/** Snapshot completo: una entrada por tabla del país. */
function fullSnapshot(country, jVersion, jTimestamp, jRows) {
  return PIPELINE_TABLES[country].map((table, i) => ({
    table,
    table_fqn: `000-sql-databricks-bridge.${country}.${table}`,
    // Las tablas de diccionario/padrón se copian en la misma corrida pero cada
    // una lleva su propio contador de versión Delta; variarlos evita que el e2e
    // pase por casualidad contra un mock donde todos son iguales.
    delta_version: table === "j_atoscompra_new" ? jVersion : 3 + i,
    delta_timestamp: jTimestamp,
    row_count: table === "j_atoscompra_new" ? jRows : 1000 * (i + 1),
  }))
}

/** Snapshot viejo (pre JAA-1121): solo J fijada, el resto sin congelar. */
function jOnlySnapshot(country) {
  return PIPELINE_TABLES[country].filter(t => t !== "j_atoscompra_new")
}

const J_VERSIONS = [
  {
    tag: "_BKP_J_AtosCompra_New_RespaldoCalibracion_202607_v2",
    country: "chile", period: "202607",
    table_fqn: "000-sql-databricks-bridge.chile.j_atoscompra_new",
    delta_version: 12, delta_timestamp: "2026-08-07T13:08:04.000Z",
    row_count: 14326866, period_min: "202101", period_max: "202607",
    tables: fullSnapshot("chile", 12, "2026-08-07T13:08:04.000Z", 14326866),
    missing_tables: [],
    created_by: "backfill@wp.numerator.com", created_at: "2026-08-07T13:08:04.000Z",
  },
  {
    tag: "_BKP_J_AtosCompra_New_RespaldoCalibracion_202607_v1",
    country: "chile", period: "202607",
    table_fqn: "001-calibration-3-0.bronze_chile.j_atoscompra_new",
    delta_version: 8, delta_timestamp: "2026-08-06T13:47:06.000Z",
    row_count: 14253458, period_min: "202101", period_max: "202607",
    // Registro histórico: se midió contra la capa de calibración, así que su FQN
    // sigue apuntando ahí aunque los snapshots nuevos se anclen en el bridge.
    tables: [{
      table: "j_atoscompra_new",
      table_fqn: "001-calibration-3-0.bronze_chile.j_atoscompra_new",
      delta_version: 8, delta_timestamp: "2026-08-06T13:47:06.000Z",
      row_count: 14253458,
    }],
    missing_tables: jOnlySnapshot("chile"),
    created_by: "backfill@wp.numerator.com", created_at: "2026-08-06T13:47:06.000Z",
  },
  {
    tag: "_BKP_J_AtosCompra_New_RespaldoCalibracion_202606_v0",
    country: "chile", period: "202606",
    table_fqn: "001-calibration-3-0.bronze_chile.j_atoscompra_new",
    delta_version: 4, delta_timestamp: "2026-06-24T21:22:45.000Z",
    row_count: 14006426, period_min: "202101", period_max: "202606",
    created_by: "backfill@wp.numerator.com", created_at: "2026-06-24T21:22:45.000Z",
  },
  {
    tag: "_BKP_J_AtosCompra_New_RespaldoCalibracion_202607_v3",
    country: "bolivia", period: "202607",
    table_fqn: "000-sql-databricks-bridge.bolivia.j_atoscompra_new",
    delta_version: 30, delta_timestamp: "2026-08-07T13:06:05.000Z",
    row_count: 5140179, period_min: "202101", period_max: "202607",
    tables: fullSnapshot("bolivia", 30, "2026-08-07T13:06:05.000Z", 5140179),
    missing_tables: [],
    created_by: "backfill@wp.numerator.com", created_at: "2026-08-07T13:06:05.000Z",
  },
  {
    tag: "_BKP_J_AtosCompra_New_RespaldoCalibracion_202607_v2",
    country: "bolivia", period: "202607",
    table_fqn: "001-calibration-3-0.bronze_bolivia.j_atoscompra_new",
    delta_version: 26, delta_timestamp: "2026-08-06T13:38:41.000Z",
    row_count: 5113568, period_min: "202101", period_max: "202607",
    created_by: "backfill@wp.numerator.com", created_at: "2026-08-06T13:38:41.000Z",
  },
]

router.get("/calibration/j-versions", (req, res) => {
  const { country, period } = req.query
  const items = J_VERSIONS.filter(
    v => (!country || v.country === country) && (!period || v.period === period),
  ).sort((a, b) => b.delta_timestamp.localeCompare(a.delta_timestamp))
  res.json({ items })
})

function findCalibrationJob(tag, country) {
  return Array.from(jobs.values()).find(
    j => j.tag === tag && (!country || j.country === country),
  )
}

function buildCalibrationZip(job, tag) {
  const tableNames = (job.results || [])
    .filter(r => r.table_name)
    .map(r => `${r.query_name}.csv`)
  const zip = buildMockZip(
    tableNames.length ? tableNames : ["report.csv"],
    `calibration report ${job.country}/${job.stage}/${job.period ?? ""} (tag ${tag})`,
  )
  const filename = `calibration_${job.country}_${job.period ?? "no-period"}_${tag}.zip`
  return { zip, filename }
}

function calibrationDownloadResource(country, tag) {
  return `calibration:${country}:${tag}`
}

// ---------------------------------------------------------------------------
// GET /calibration/runs?country=&period=&status=&limit=&offset=
// Server-authoritative list of calibration runs (JAA-648), backed by the shared
// process-run store (here the in-memory `jobs` Map filtered to stage=calibracion).
// The frontend derives the active run as items[0] (newest first) instead of from
// per-browser localStorage, so the running state survives reload and is shared
// across browsers. MUST be declared before "/calibration/:tag/download" so the
// literal "runs" segment is not captured as a :tag.
// ---------------------------------------------------------------------------

router.get("/calibration/runs", (req, res) => {
  const { country, period, status, limit: ls, offset: os } = req.query
  const limit = parseInt(ls, 10) || 50
  const offset = parseInt(os, 10) || 0

  let items = Array.from(jobs.values())
    .filter(j => j.stage === "calibracion")
    .map(enrichSummary)
  if (country) items = items.filter(j => j.country === country)
  if (status) items = items.filter(j => j.status === status)
  if (period) items = items.filter(j => String(j.period) === String(period))
  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  res.json({ items: items.slice(offset, offset + limit), total: items.length, limit, offset })
})

// ---------------------------------------------------------------------------
// GET /calibration/:tag/download?country=
// Returns a zip blob with the calibration report for the given tag.
// 404 { error, message } when no calibration job matches the tag.
// Used by the frontend downloadCalibrationReport(tag, country).
// ---------------------------------------------------------------------------

router.get("/calibration/:tag/download", (req, res) => {
  const { tag } = req.params
  const { country } = req.query

  // Match against seeded/triggered calibration jobs by tag (optionally country).
  const job = findCalibrationJob(tag, country)
  if (!job) {
    return res.status(404).json({ error: "not_found", message: `No calibration report found for tag "${tag}"` })
  }

  const { zip, filename } = buildCalibrationZip(job, tag)
  res.setHeader("Content-Type", "application/zip")
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
  res.send(zip)
})

// ---------------------------------------------------------------------------
// GET /calibration/:tag/download-url?country=   (JAA-757/758)
// Issues a short-lived signed URL; the frontend navigates the browser to it
// directly (native download, no Authorization header) instead of axios-blob.
// ---------------------------------------------------------------------------

router.get("/calibration/:tag/download-url", (req, res) => {
  const { tag } = req.params
  const { country } = req.query
  const job = findCalibrationJob(tag, country)
  if (!job) {
    return res.status(404).json({ error: "not_found", message: `No calibration report found for tag "${tag}"` })
  }
  const { token, expiresIn } = issueDownloadToken(calibrationDownloadResource(country, tag))
  res.json({
    url: `/api/v1/calibration/${tag}/download-signed?country=${encodeURIComponent(country ?? "")}&token=${token}`,
    expires_in: expiresIn,
  })
})

// ---------------------------------------------------------------------------
// GET /calibration/:tag/download-signed?country=&token=   (JAA-757/758)
// No Authorization header required — access is gated by the signed token.
// ---------------------------------------------------------------------------

router.get("/calibration/:tag/download-signed", (req, res) => {
  const { tag } = req.params
  const { country, token } = req.query
  const failure = validateDownloadToken(token, calibrationDownloadResource(country, tag))
  if (failure) {
    return res.status(failure.status).json({ error: failure.error, message: failure.message })
  }
  const job = findCalibrationJob(tag, country)
  if (!job) {
    return res.status(404).json({ error: "not_found", message: `No calibration report found for tag "${tag}"` })
  }
  const { zip, filename } = buildCalibrationZip(job, tag)
  res.setHeader("Content-Type", "application/zip")
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
  res.send(zip)
})

export default router

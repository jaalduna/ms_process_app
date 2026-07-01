import { Router } from "express"
import { jobs, enrichSummary } from "./sync.js"
import { buildMockZip } from "../lib/zip.js"
import { issueDownloadToken, validateDownloadToken } from "../lib/download-tokens.js"

const router = Router()

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

import { Router } from "express"
import { jobs } from "./sync.js"
import { buildMockZip } from "../lib/zip.js"

const router = Router()

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
  const job = Array.from(jobs.values()).find(
    j => j.tag === tag && (!country || j.country === country),
  )
  if (!job) {
    return res.status(404).json({ error: "not_found", message: `No calibration report found for tag "${tag}"` })
  }

  const tableNames = (job.results || [])
    .filter(r => r.table_name)
    .map(r => `${r.query_name}.csv`)
  const zip = buildMockZip(
    tableNames.length ? tableNames : ["report.csv"],
    `calibration report ${job.country}/${job.stage}/${job.period ?? ""} (tag ${tag})`,
  )
  const filename = `calibration_${job.country}_${job.period ?? "no-period"}_${tag}.zip`
  res.setHeader("Content-Type", "application/zip")
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
  res.send(zip)
})

export default router

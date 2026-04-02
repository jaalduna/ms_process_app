import { Router } from "express"
import { TagStore } from "../stores/tag-store.js"
import { COUNTRIES } from "./sync.js"

const router = Router()

export const tagStore = new TagStore()

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.get("/traceability/tags", (req, res) => {
  res.json(tagStore.list(req.query))
})

router.get("/traceability/tags/:tagId", (req, res) => {
  const tag = tagStore.get(req.params.tagId)
  if (!tag) return res.status(404).json({ error: "not_found", message: `Tag ${req.params.tagId} not found` })
  res.json(tag)
})

router.get("/traceability/tags/:tagId/tables/:tableName/download", (req, res) => {
  const tag = tagStore.get(req.params.tagId)
  if (!tag) return res.status(404).json({ error: "not_found", message: `Tag ${req.params.tagId} not found` })
  const table = tag.tables.find(t => t.table_name === req.params.tableName)
  if (!table) return res.status(404).json({ error: "not_found", message: `Table ${req.params.tableName} not found in tag` })

  // Generate mock CSV data
  const rows = Math.min(table.row_count, 100) // limit to 100 rows for mock
  const headers = ["id", "country", "period", "value_1", "value_2", "created_at"]
  const lines = [headers.join(",")]
  for (let i = 0; i < rows; i++) {
    lines.push([i + 1, tag.country, tag.period, (Math.random() * 1000).toFixed(2), (Math.random() * 500).toFixed(2), new Date(Date.now() - Math.random() * 86400000 * 30).toISOString()].join(","))
  }
  const filename = `${tag.country}_${tag.stage}_${table.table_name}_${tag.period}.csv`
  res.setHeader("Content-Type", "text/csv")
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
  res.send(lines.join("\n"))
})

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

const STAGES = ["prices", "elegibilidad", "weighting", "calibration", "mtr"]
const PERIODS = [202601, 202602, 202603]
const TABLE_TEMPLATES = {
  prices: [{ name: "outliers", schema: "prices" }, { name: "cleaned_prices", schema: "prices" }],
  elegibilidad: [{ name: "eligible_households", schema: "eligibility" }, { name: "exclusions", schema: "eligibility" }],
  weighting: [{ name: "weights", schema: "weighting" }, { name: "distributions", schema: "weighting" }],
  calibration: [{ name: "kpis", schema: "calibration" }, { name: "penetration", schema: "calibration" }, { name: "volumes", schema: "calibration" }],
  mtr: [{ name: "targets", schema: "mtr" }, { name: "imputations", schema: "mtr" }],
}

export function seedTraceability() {
  let tagCount = 0
  // Spread tags across countries, stages, and periods to get 20+
  for (const country of COUNTRIES.slice(0, 5)) { // 5 countries
    for (const stage of STAGES) { // 5 stages
      const period = PERIODS[tagCount % PERIODS.length]
      const daysAgo = Math.floor(Math.random() * 30) + 1
      const completed = new Date(Date.now() - daysAgo * 86400000).toISOString()
      const started = new Date(new Date(completed).getTime() - Math.random() * 3600000).toISOString()
      const templates = TABLE_TEMPLATES[stage] || []
      const tables = templates.map(t => ({
        table_name: t.name,
        full_name: `kpi_prd_01.${t.schema}.${country.code}_${t.name}`,
        catalog: "kpi_prd_01",
        schema_name: t.schema,
        row_count: Math.floor(Math.random() * 5000) + 100,
      }))
      tagStore.add({ country: country.code, period, stage, triggered_by: "dev@localhost", started_at: started, completed_at: completed, status: "completed", tables, created_at: started })
      tagCount++
    }
  }
  // tagCount = 25 (5 countries x 5 stages)
}

export default router

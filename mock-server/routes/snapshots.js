import { Router } from "express"
import crypto from "crypto"
import { J_VERSIONS } from "./calibration.js"

const router = Router()

/** Valor de `j_source` que significa "sincronizar" — espejo de J_SOURCE_SYNC en src/types/api.ts. */
export const J_SOURCE_SYNC = "sync"

// -- Versiones bronze de pesaje/elegibilidad (JAA-1179/JAA-1183) ------------
// Generalización de /calibration/j-versions a los otros dos procesos que
// también pueden lanzarse sobre un snapshot fijo del bridge en vez de
// sincronizar. Mismo shape de respuesta ({ items: JVersion[] }) para que el
// `JSourceSelector` compartido no necesite distinguir el proceso.

function fullTables(country, tableNames, { version = 5, timestamp = "2026-08-15T09:00:00.000Z", rowsBase = 10_000 } = {}) {
  return tableNames.map((table, i) => ({
    table,
    table_fqn: `000-sql-databricks-bridge.${country}.${table}`,
    delta_version: version + i,
    delta_timestamp: timestamp,
    row_count: rowsBase * (i + 1),
  }))
}

const PESAJE_TABLES = ["mordom", "rg_domicilios_pesos", "rg_panelis"]
const ELEGIBILIDAD_TABLES = [
  "j_atoscompra_new_full",
  "rg_panelis_full",
  "mordom_full",
  "pre_mordom_full",
  "domicilios_full",
  "paineis_domicilios_full",
  "dt_mes_full",
]

export const PESAJE_SNAPSHOTS = [
  {
    tag: "bolivia-202605-1a2b3c4d",
    country: "bolivia", period: "202605",
    table_fqn: "000-sql-databricks-bridge.bolivia.mordom",
    delta_version: 7, delta_timestamp: "2026-06-02T08:15:00.000Z",
    row_count: 42_000, period_min: "202101", period_max: "202605",
    tables: fullTables("bolivia", PESAJE_TABLES, { version: 7, timestamp: "2026-06-02T08:15:00.000Z", rowsBase: 14_000 }),
    missing_tables: [],
    created_by: "backfill@wp.numerator.com", created_at: "2026-06-02T08:15:00.000Z",
  },
  {
    tag: "bolivia-202604-9f3e21ab",
    country: "bolivia", period: "202604",
    table_fqn: "000-sql-databricks-bridge.bolivia.mordom",
    delta_version: 5, delta_timestamp: "2026-05-03T08:15:00.000Z",
    row_count: 39_600, period_min: "202101", period_max: "202604",
    tables: fullTables("bolivia", PESAJE_TABLES, { version: 5, timestamp: "2026-05-03T08:15:00.000Z", rowsBase: 13_200 }),
    missing_tables: [],
    created_by: "backfill@wp.numerator.com", created_at: "2026-05-03T08:15:00.000Z",
  },
  {
    tag: "chile-202605-77bc4e10",
    country: "chile", period: "202605",
    table_fqn: "000-sql-databricks-bridge.chile.mordom",
    delta_version: 11, delta_timestamp: "2026-06-01T10:30:00.000Z",
    row_count: 61_500, period_min: "202101", period_max: "202605",
    tables: fullTables("chile", PESAJE_TABLES, { version: 11, timestamp: "2026-06-01T10:30:00.000Z", rowsBase: 20_500 }),
    missing_tables: [],
    created_by: "backfill@wp.numerator.com", created_at: "2026-06-01T10:30:00.000Z",
  },
]

export const ELEGIBILIDAD_SNAPSHOTS = [
  {
    tag: "bolivia-202605-b2c4f890",
    country: "bolivia", period: "202605",
    table_fqn: "000-sql-databricks-bridge.bolivia.j_atoscompra_new_full",
    delta_version: 9, delta_timestamp: "2026-06-02T09:00:00.000Z",
    row_count: 5_200_000, period_min: "202101", period_max: "202605",
    tables: fullTables("bolivia", ELEGIBILIDAD_TABLES, { version: 9, timestamp: "2026-06-02T09:00:00.000Z", rowsBase: 743_000 }),
    missing_tables: [],
    created_by: "backfill@wp.numerator.com", created_at: "2026-06-02T09:00:00.000Z",
  },
  {
    tag: "brasil-202605-dd781a2c",
    country: "brasil", period: "202605",
    table_fqn: "000-sql-databricks-bridge.brasil.j_atoscompra_new_full",
    delta_version: 14, delta_timestamp: "2026-06-01T11:45:00.000Z",
    row_count: 18_400_000, period_min: "202101", period_max: "202605",
    tables: fullTables("brasil", ELEGIBILIDAD_TABLES, { version: 14, timestamp: "2026-06-01T11:45:00.000Z", rowsBase: 2_628_000 }),
    missing_tables: [],
    created_by: "backfill@wp.numerator.com", created_at: "2026-06-01T11:45:00.000Z",
  },
]

const STORES = {
  pesaje: PESAJE_SNAPSHOTS,
  elegibilidad: ELEGIBILIDAD_SNAPSHOTS,
  calibracion: J_VERSIONS,
}

router.get("/snapshots/:process", (req, res) => {
  const items = STORES[req.params.process]
  if (!items) {
    return res.status(404).json({ error: "not_found", message: `Unknown process "${req.params.process}"` })
  }
  const { country, period } = req.query
  const filtered = items
    .filter(v => (!country || v.country === country) && (!period || v.period === period))
    .sort((a, b) => b.delta_timestamp.localeCompare(a.delta_timestamp))
  res.json({ items: filtered })
})

/**
 * Register the snapshot a completed pesaje/elegibilidad run resolved to
 * (JAA-1179/JAA-1183): pushes a new `JVersion`-shaped entry so the selector
 * shows it on the next launch, mirroring the manifest the real API would read
 * from `bronze_snapshot.json`.
 *
 * @param {"pesaje"|"elegibilidad"} process
 * @param {{ country: string, period: string|number, tag: string }} run
 */
export function registerSnapshot(process, { country, period, tag }) {
  const items = STORES[process]
  if (!items) return
  if (items.some(v => v.tag === tag && v.country === country)) return
  const tableNames = process === "pesaje" ? PESAJE_TABLES : ELEGIBILIDAD_TABLES
  const now = new Date().toISOString()
  items.unshift({
    tag,
    country,
    period: String(period),
    table_fqn: `000-sql-databricks-bridge.${country}.${tableNames[0]}`,
    delta_version: 1,
    delta_timestamp: now,
    row_count: 1000,
    period_min: "202101",
    period_max: String(period),
    tables: fullTables(country, tableNames, { version: 1, timestamp: now, rowsBase: 1000 }),
    missing_tables: [],
    created_by: "dev@localhost",
    created_at: now,
  })
}

/** `${country}-${period}-<8hex>`, el mismo formato de tag que usan los fixtures. */
export function generateSnapshotTag(country, period) {
  return `${country}-${period}-${crypto.randomBytes(4).toString("hex")}`
}

export default router

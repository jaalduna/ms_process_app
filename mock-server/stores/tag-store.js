import crypto from "crypto"

/**
 * In-memory tag store for the Traceability module.
 * Tags represent metadata snapshots of completed pipeline runs.
 */
export class TagStore {
  constructor() {
    /** @type {Map<string, object>} */
    this.tags = new Map()
  }

  /**
   * Add a tag.
   * @param {object} data - tag fields (country, period, stage, triggered_by, tables, etc.)
   * @returns {object} the created tag
   */
  add(data) {
    const tagId = crypto.randomUUID()
    const now = new Date().toISOString()
    const tag = {
      tag_id: tagId,
      run_id: data.run_id ?? crypto.randomUUID(),
      country: data.country,
      period: data.period,
      stage: data.stage,
      triggered_by: data.triggered_by ?? "system-seed",
      started_at: data.started_at ?? now,
      completed_at: data.completed_at ?? now,
      status: data.status ?? "completed",
      tables_count: data.tables ? data.tables.length : 0,
      tables: data.tables ?? [],
      created_at: data.created_at ?? now,
    }
    this.tags.set(tagId, tag)
    return tag
  }

  /**
   * List tags with optional filters and pagination.
   *
   * The frontend (src/modules/trazabilidad/types.ts `Tag`) expects ONE row per
   * (snapshot × Delta table), shaped as
   *   { table_name, version, tag, description, created_by, created_at, job_id }
   * — NOT the internal snapshot shape. We flatten + project here so the
   * traceability page renders (it calls `t.tag.toLowerCase()` and would crash
   * on the old shape).
   *
   * @param {{ country?: string, period?: string, stage?: string, date_from?: string, date_to?: string, limit?: number, offset?: number }} filters
   */
  list(filters = {}) {
    let snapshots = Array.from(this.tags.values())
    if (filters.country) snapshots = snapshots.filter(t => t.country === filters.country)
    if (filters.period) snapshots = snapshots.filter(t => String(t.period) === String(filters.period))
    if (filters.stage) snapshots = snapshots.filter(t => t.stage === filters.stage)
    if (filters.date_from) {
      const from = new Date(filters.date_from).getTime()
      snapshots = snapshots.filter(t => new Date(t.completed_at).getTime() >= from)
    }
    if (filters.date_to) {
      const to = new Date(filters.date_to).getTime()
      snapshots = snapshots.filter(t => new Date(t.completed_at).getTime() <= to)
    }
    snapshots.sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())

    // Flatten each snapshot's tables into frontend `Tag` rows.
    const rows = []
    for (const s of snapshots) {
      const tagName = `${s.country}_${s.stage}_${s.period}`
      const createdAt = s.completed_at ?? s.created_at
      const tables = s.tables && s.tables.length ? s.tables : [null]
      tables.forEach((tbl, idx) => {
        rows.push({
          table_name: tbl ? tbl.full_name : `kpi_prd_01.${s.stage}.${s.country}_no_tables`,
          version: ((Number(s.period) + idx) % 9) + 1,
          tag: tagName,
          description: s.status === "failed" ? "Run failed — no tables produced" : null,
          created_by: s.triggered_by,
          created_at: createdAt,
          job_id: s.run_id,
        })
      })
    }

    const total = rows.length
    const limit = parseInt(filters.limit, 10) || 50
    const offset = parseInt(filters.offset, 10) || 0
    return { items: rows.slice(offset, offset + limit), total, limit, offset }
  }

  /**
   * Look up a tag snapshot by any identifier the list exposes. The flattened
   * list rows carry `job_id` (= the snapshot's run_id), not the internal
   * tag_id, so detail/download routes must resolve by either. Also accepts the
   * tag NAME (country_stage_period) as a convenience.
   * @param {string} id
   */
  get(id) {
    const direct = this.tags.get(id)
    if (direct) return direct
    for (const t of this.tags.values()) {
      if (t.run_id === id) return t
      if (`${t.country}_${t.stage}_${t.period}` === id) return t
    }
    return null
  }

  /** Clear all tags. */
  reset() {
    this.tags.clear()
  }
}

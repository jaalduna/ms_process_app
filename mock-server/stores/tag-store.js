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
   * @param {{ country?: string, period?: string, stage?: string, date_from?: string, date_to?: string, limit?: number, offset?: number }} filters
   */
  list(filters = {}) {
    let items = Array.from(this.tags.values())
    if (filters.country) items = items.filter(t => t.country === filters.country)
    if (filters.period) items = items.filter(t => String(t.period) === String(filters.period))
    if (filters.stage) items = items.filter(t => t.stage === filters.stage)
    if (filters.date_from) {
      const from = new Date(filters.date_from).getTime()
      items = items.filter(t => new Date(t.completed_at).getTime() >= from)
    }
    if (filters.date_to) {
      const to = new Date(filters.date_to).getTime()
      items = items.filter(t => new Date(t.completed_at).getTime() <= to)
    }
    items.sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
    const total = items.length
    const limit = parseInt(filters.limit, 10) || 50
    const offset = parseInt(filters.offset, 10) || 0
    // Strip tables from list items (only include in detail)
    const listItems = items.slice(offset, offset + limit).map(({ tables, ...rest }) => rest)
    return { items: listItems, total, limit, offset }
  }

  /** @param {string} tagId */
  get(tagId) {
    return this.tags.get(tagId) ?? null
  }

  /** Clear all tags. */
  reset() {
    this.tags.clear()
  }
}

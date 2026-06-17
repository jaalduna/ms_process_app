/**
 * In-memory store for per-stage, per-country process open/close state.
 * Each pipeline stage (precios, elegibilidad, pesaje, calibracion, mtr)
 * is opened/closed independently for each country. Tracks who changed
 * the state, when, and a capped history of changes so colleagues can
 * see each other's actions.
 */

const HISTORY_LIMIT = 20

export class ProcessStateStore {
  constructor() {
    /** Map<`${stage}:${country}`, entry> */
    this.states = new Map()
  }

  /** Clear all state (used by the test reset endpoint). */
  reset() {
    this.states.clear()
  }

  key(stage, country) {
    return `${stage}:${country}`
  }

  ensure(stage, country) {
    const key = this.key(stage, country)
    if (!this.states.has(key)) {
      this.states.set(key, {
        country,
        stage,
        // A process not yet acted on is "open" (in progress / editable); it
        // only becomes "closed" (finalized, locked) when someone closes it.
        status: "open",
        changed_by: null,
        changed_by_email: null,
        changed_at: null,
        history: [],
      })
    }
    return this.states.get(key)
  }

  get(stage, country) {
    return this.states.get(this.key(stage, country)) ?? null
  }

  /** Returns nested Record<country, Record<stage, entry>> for the status endpoint. */
  getAll() {
    const out = {}
    for (const entry of this.states.values()) {
      out[entry.country] ??= {}
      out[entry.country][entry.stage] = entry
    }
    return out
  }

  /**
   * Set the open/closed status for a stage+country.
   * Returns { conflict, entry } — conflict=true when already in that state.
   */
  setStatus(stage, country, status, user) {
    const entry = this.ensure(stage, country)
    if (entry.status === status) return { conflict: true, entry }
    entry.status = status
    entry.changed_by = user.name
    entry.changed_by_email = user.email
    entry.changed_at = new Date().toISOString()
    entry.history.unshift({
      action: status,
      user_name: user.name,
      user_email: user.email,
      at: entry.changed_at,
    })
    if (entry.history.length > HISTORY_LIMIT) entry.history.length = HISTORY_LIMIT
    return { conflict: false, entry }
  }
}

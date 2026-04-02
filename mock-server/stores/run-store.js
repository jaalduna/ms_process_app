import crypto from "crypto"

/**
 * Generic in-memory run store for pipeline modules (Prices, Weighting, MTR).
 * Each module creates its own RunStore instance with module-specific steps and result generators.
 */
export class RunStore {
  /** @param {string} moduleName */
  constructor(moduleName) {
    this.moduleName = moduleName
    /** @type {Map<string, object>} */
    this.runs = new Map()
    /** @type {Map<string, NodeJS.Timeout>} */
    this.timers = new Map()
  }

  /**
   * Create a new run.
   * @param {string} country
   * @param {number} period
   * @param {string[]} stepNames - ordered step names for this module
   * @param {object} [params] - module-specific parameters
   * @param {object} [extras] - extra fields to merge into the run
   * @returns {object} the created run
   */
  create(country, period, stepNames, params, extras) {
    const runId = crypto.randomUUID()
    const now = new Date().toISOString()
    const steps = stepNames.map(name => ({
      name,
      status: "pending",
      started_at: null,
      completed_at: null,
      error: null,
    }))

    const run = {
      run_id: runId,
      country,
      period,
      status: "pending",
      parameters_json: params ?? {},
      steps,
      current_step: null,
      started_at: null,
      completed_at: null,
      created_by: "dev@localhost",
      created_at: now,
      updated_at: now,
      error_message: null,
      ...extras,
    }
    this.runs.set(runId, run)
    return run
  }

  /**
   * List runs with optional filters and pagination.
   * @param {{ country?: string, period?: string, status?: string, limit?: number, offset?: number }} filters
   */
  list(filters = {}) {
    let items = Array.from(this.runs.values())
    if (filters.country) items = items.filter(r => r.country === filters.country)
    if (filters.period) items = items.filter(r => String(r.period) === String(filters.period))
    if (filters.status) items = items.filter(r => r.status === filters.status)
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    const total = items.length
    const limit = parseInt(filters.limit, 10) || 50
    const offset = parseInt(filters.offset, 10) || 0
    return { items: items.slice(offset, offset + limit), total, limit, offset }
  }

  /** @param {string} runId */
  get(runId) {
    return this.runs.get(runId) ?? null
  }

  /**
   * Start step progression for a run.
   * @param {string} runId
   * @param {function} [onComplete] - callback(run) when all steps complete
   * @param {number} [intervalMs=2000]
   */
  execute(runId, onComplete, intervalMs = 2000) {
    const run = this.runs.get(runId)
    if (!run) return null
    if (run.status !== "pending") return run

    run.status = "running"
    run.started_at = new Date().toISOString()
    run.updated_at = new Date().toISOString()

    // Start first step
    if (run.steps.length > 0) {
      run.steps[0].status = "running"
      run.steps[0].started_at = new Date().toISOString()
      run.current_step = run.steps[0].name
    }

    const timer = setInterval(() => {
      this._advanceStep(run)
      if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
        clearInterval(timer)
        this.timers.delete(runId)
        if (onComplete) onComplete(run)
      }
    }, intervalMs)
    this.timers.set(runId, timer)
    return run
  }

  /** @param {string} runId */
  cancel(runId) {
    const run = this.runs.get(runId)
    if (!run) return null
    if (run.status !== "running" && run.status !== "pending") return run

    // Stop timer
    const timer = this.timers.get(runId)
    if (timer) {
      clearInterval(timer)
      this.timers.delete(runId)
    }

    run.status = "cancelled"
    run.completed_at = new Date().toISOString()
    run.updated_at = new Date().toISOString()
    run.current_step = null
    run.error_message = "Cancelled by user"

    // Mark running steps as failed
    for (const step of run.steps) {
      if (step.status === "running") {
        step.status = "failed"
        step.completed_at = new Date().toISOString()
        step.error = "Cancelled by user"
      }
    }
    return run
  }

  /** @param {string} runId */
  approve(runId) {
    const run = this.runs.get(runId)
    if (!run) return null
    run.status = "approved"
    run.approved_by = "dev@localhost"
    run.approved_at = new Date().toISOString()
    run.updated_at = new Date().toISOString()
    return run
  }

  /**
   * Create a pre-seeded completed run.
   * @param {string} country
   * @param {number} period
   * @param {string[]} stepNames
   * @param {number} daysAgo
   * @param {object} [extras]
   */
  seedCompleted(country, period, stepNames, daysAgo, extras) {
    const runId = crypto.randomUUID()
    const created = new Date(Date.now() - daysAgo * 86400000).toISOString()
    const started = new Date(new Date(created).getTime() + 2000).toISOString()
    let cursor = new Date(started).getTime()

    const steps = stepNames.map(name => {
      const s = new Date(cursor).toISOString()
      cursor += Math.floor(Math.random() * 5000) + 1000
      const c = new Date(cursor).toISOString()
      cursor += 500
      return { name, status: "completed", started_at: s, completed_at: c, error: null }
    })

    const completed = new Date(cursor).toISOString()

    const run = {
      run_id: runId,
      country,
      period,
      status: "completed",
      parameters_json: {},
      steps,
      current_step: null,
      started_at: started,
      completed_at: completed,
      created_by: "system-seed",
      created_at: created,
      updated_at: completed,
      error_message: null,
      ...extras,
    }
    this.runs.set(runId, run)
    return run
  }

  /**
   * Get last completed run per country.
   * @returns {Record<string, object|null>}
   */
  lastCompleted() {
    const result = {}
    for (const run of this.runs.values()) {
      if (run.status !== "completed" && run.status !== "approved") continue
      const prev = result[run.country]
      if (!prev || new Date(run.completed_at) > new Date(prev.completed_at)) {
        result[run.country] = {
          country: run.country,
          completed_at: run.completed_at,
          run_id: run.run_id,
          period: run.period,
        }
      }
    }
    return result
  }

  /** Clear all runs and stop all timers. */
  reset() {
    for (const timer of this.timers.values()) clearInterval(timer)
    this.timers.clear()
    this.runs.clear()
  }

  /** @private */
  _advanceStep(run) {
    if (run.status !== "running") return

    const currentIdx = run.steps.findIndex(s => s.status === "running")
    if (currentIdx === -1) return

    const step = run.steps[currentIdx]

    // 5% chance of failure
    if (Math.random() < 0.05) {
      step.status = "failed"
      step.completed_at = new Date().toISOString()
      step.error = `Step "${step.name}" failed: simulated error`
      run.status = "failed"
      run.completed_at = new Date().toISOString()
      run.updated_at = new Date().toISOString()
      run.current_step = null
      run.error_message = `Pipeline failed at step: ${step.name}`
      return
    }

    // Complete current step
    step.status = "completed"
    step.completed_at = new Date().toISOString()

    // Start next step or finish
    if (currentIdx + 1 < run.steps.length) {
      const next = run.steps[currentIdx + 1]
      next.status = "running"
      next.started_at = new Date().toISOString()
      run.current_step = next.name
    } else {
      run.status = "completed"
      run.completed_at = new Date().toISOString()
      run.current_step = null
    }
    run.updated_at = new Date().toISOString()
  }
}

import crypto from "crypto"

/**
 * In-memory store for the Eligibility module.
 *
 * Unlike the generic RunStore (linear step progression), eligibility has a
 * multi-phase, user-gated state machine that mirrors the real Bridge API:
 *
 *   pending --execute-->  running --(auto)--> results_ready
 *   results_ready --approve--> applying_sql --(auto)--> mordom_downloading
 *                                            --(auto)--> mordom_ready
 *   mordom_ready --upload--> mordom_uploaded
 *   mordom_uploaded --apply-mordom--> applying_mordom --(auto)--> ready
 *
 * The "(auto)" transitions advance on a timer so the UI can poll and observe
 * progress (parity with prices/weighting/mtr).
 */

export const ELIGIBILITY_STEPS = [
  "run_pipeline",
  "download_results",
  "approve",
  "apply_sql",
  "download_mordom",
  "upload_mordom",
  "apply_mordom",
  "complete",
]

function iso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString()
}

function makeMetrics() {
  const naturales = Math.floor(Math.random() * 4000) + 1000
  return {
    elegibles_naturales: naturales,
    donadores_totales: Math.floor(naturales * (0.4 + Math.random() * 0.2)),
    receptores_totales: Math.floor(naturales * (0.3 + Math.random() * 0.2)),
    muertos: Math.floor(Math.random() * 200),
    inconsistentes: Math.floor(Math.random() * 150),
    buen_colaborador: Math.floor(naturales * (0.6 + Math.random() * 0.3)),
  }
}

export class EligibilityStore {
  constructor() {
    /** @type {Map<string, object>} */
    this.runs = new Map()
    /** @type {Map<string, NodeJS.Timeout>} */
    this.timers = new Map()
    /** When true, transient phases advance instantly on first tick (faster e2e). */
    this.deterministic = false
    // Per-step delay; override via MOCK_STEP_INTERVAL_MS (e.g. fast e2e) — falls back to 1500ms.
    this.intervalMs = Number(process.env.MOCK_STEP_INTERVAL_MS) || 1500
  }

  setDeterministic(flag) {
    this.deterministic = !!flag
  }

  _newSteps() {
    return ELIGIBILITY_STEPS.map(name => ({
      name,
      status: "pending",
      started_at: null,
      completed_at: null,
      error: null,
    }))
  }

  _step(run, name) {
    return run.steps.find(s => s.name === name)
  }

  create(country, period, params) {
    const runId = crypto.randomUUID()
    const now = iso()
    const run = {
      run_id: runId,
      country,
      period: Number(period),
      status: "pending",
      parameters_json: params ?? {},
      phase1_metrics_json: null,
      steps: this._newSteps(),
      files: [],
      current_step: null,
      started_at: null,
      completed_at: null,
      created_by: "dev@localhost",
      created_at: now,
      updated_at: now,
      approved_by: null,
      approved_at: null,
      error_message: null,
    }
    this.runs.set(runId, run)
    return run
  }

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

  get(runId) {
    return this.runs.get(runId) ?? null
  }

  update(runId, patch) {
    const run = this.runs.get(runId)
    if (!run) return null
    const { run_id, created_at, ...safe } = patch || {}
    Object.assign(run, safe)
    run.updated_at = iso()
    return run
  }

  delete(runId) {
    const timer = this.timers.get(runId)
    if (timer) { clearInterval(timer); this.timers.delete(runId) }
    return this.runs.delete(runId)
  }

  _addFile(run, { stage, direction, filename, uploaded_by }) {
    const file = {
      file_id: crypto.randomUUID(),
      run_id: run.run_id,
      stage,
      direction,
      filename,
      stored_path: `/mock/eligibility/${run.run_id}/${filename}`,
      file_size_bytes: Math.floor(Math.random() * 500_000) + 10_000,
      uploaded_by: uploaded_by ?? null,
      created_at: iso(),
    }
    run.files.push(file)
    return file
  }

  _markRunning(run, stepName) {
    const step = this._step(run, stepName)
    if (step) {
      step.status = "running"
      if (!step.started_at) step.started_at = iso()
    }
    run.current_step = stepName
    run.updated_at = iso()
  }

  _complete(run, stepName) {
    const step = this._step(run, stepName)
    if (step) {
      step.status = "completed"
      if (!step.started_at) step.started_at = iso()
      step.completed_at = iso()
    }
    run.updated_at = iso()
  }

  /**
   * Drive a transient phase to its resting state on a timer.
   * @param {string} runId
   * @param {Array<() => void>} ticks - ordered side-effects, one per interval
   */
  _runPhase(runId, ticks) {
    // Clear any existing timer for this run
    const existing = this.timers.get(runId)
    if (existing) clearInterval(existing)

    let i = 0
    const step = () => {
      const run = this.runs.get(runId)
      if (!run || run.status === "cancelled") {
        const t = this.timers.get(runId)
        if (t) { clearInterval(t); this.timers.delete(runId) }
        return
      }
      if (i < ticks.length) {
        ticks[i]()
        i++
      }
      if (i >= ticks.length) {
        const t = this.timers.get(runId)
        if (t) { clearInterval(t); this.timers.delete(runId) }
      }
    }

    if (this.deterministic) {
      // Run all ticks immediately for deterministic/fast e2e.
      while (i < ticks.length) { ticks[i](); i++ }
      return
    }
    const timer = setInterval(step, this.intervalMs)
    this.timers.set(runId, timer)
  }

  execute(runId) {
    const run = this.runs.get(runId)
    if (!run) return null
    if (run.status !== "pending") return run
    run.status = "running"
    run.started_at = iso()
    this._markRunning(run, "run_pipeline")

    this._runPhase(runId, [
      () => {
        this._complete(run, "run_pipeline")
        this._markRunning(run, "download_results")
      },
      () => {
        this._complete(run, "download_results")
        run.phase1_metrics_json = makeMetrics()
        this._addFile(run, { stage: 1, direction: "download", filename: `eligibility_results_${run.country}_${run.period}.csv` })
        run.status = "results_ready"
        run.current_step = null
        run.updated_at = iso()
      },
    ])
    return run
  }

  approve(runId) {
    const run = this.runs.get(runId)
    if (!run) return null
    if (run.status !== "results_ready") return run
    run.approved_by = "dev@localhost"
    run.approved_at = iso()
    this._complete(run, "approve")
    run.status = "applying_sql"
    this._markRunning(run, "apply_sql")

    this._runPhase(runId, [
      () => {
        this._complete(run, "apply_sql")
        run.status = "mordom_downloading"
        this._markRunning(run, "download_mordom")
      },
      () => {
        this._complete(run, "download_mordom")
        this._addFile(run, { stage: 2, direction: "download", filename: `mordom_${run.country}_${run.period}.csv` })
        run.status = "mordom_ready"
        run.current_step = null
        run.updated_at = iso()
      },
    ])
    return run
  }

  /** Upload corrected MorDom CSV. Synchronous transition mordom_ready → mordom_uploaded. */
  upload(runId, filename) {
    const run = this.runs.get(runId)
    if (!run) return null
    const file = this._addFile(run, {
      stage: 2,
      direction: "upload",
      filename: filename || `mordom_corrected_${run.country}_${run.period}.csv`,
      uploaded_by: "dev@localhost",
    })
    this._complete(run, "upload_mordom")
    if (run.status === "mordom_ready") {
      run.status = "mordom_uploaded"
      run.current_step = null
    }
    run.updated_at = iso()
    return file
  }

  applyMordom(runId) {
    const run = this.runs.get(runId)
    if (!run) return null
    if (run.status !== "mordom_uploaded") return run
    run.status = "applying_mordom"
    this._markRunning(run, "apply_mordom")

    this._runPhase(runId, [
      () => {
        this._complete(run, "apply_mordom")
        this._complete(run, "complete")
        run.status = "ready"
        run.completed_at = iso()
        run.current_step = null
        run.updated_at = iso()
      },
    ])
    return run
  }

  cancel(runId) {
    const run = this.runs.get(runId)
    if (!run) return null
    if (["ready", "failed", "cancelled"].includes(run.status)) return run
    const timer = this.timers.get(runId)
    if (timer) { clearInterval(timer); this.timers.delete(runId) }
    run.status = "cancelled"
    run.completed_at = iso()
    run.current_step = null
    run.error_message = "Cancelled by user"
    for (const step of run.steps) {
      if (step.status === "running") {
        step.status = "failed"
        step.completed_at = iso()
        step.error = "Cancelled by user"
      }
    }
    run.updated_at = iso()
    return run
  }

  /** Seed a fully-completed (ready) run with all files present. */
  seedReady(country, period, daysAgo = 1) {
    const run = this.create(country, period, {
      colaboracion_min: 0.6,
      meses_lookback: 12,
    })
    const created = new Date(Date.now() - daysAgo * 86400000)
    let cursor = created.getTime()
    run.created_at = new Date(cursor).toISOString()
    run.started_at = new Date(cursor + 2000).toISOString()
    cursor += 2000
    for (const step of run.steps) {
      step.status = "completed"
      step.started_at = new Date(cursor).toISOString()
      cursor += 3000
      step.completed_at = new Date(cursor).toISOString()
      cursor += 500
    }
    run.status = "ready"
    run.completed_at = new Date(cursor).toISOString()
    run.updated_at = run.completed_at
    run.approved_by = "system-seed"
    run.approved_at = run.steps[2].completed_at
    run.current_step = null
    run.phase1_metrics_json = makeMetrics()
    run.created_by = "system-seed"
    this._addFile(run, { stage: 1, direction: "download", filename: `eligibility_results_${country}_${period}.csv` })
    this._addFile(run, { stage: 2, direction: "download", filename: `mordom_${country}_${period}.csv` })
    this._addFile(run, { stage: 2, direction: "upload", filename: `mordom_corrected_${country}_${period}.csv`, uploaded_by: "system-seed" })
    return run
  }

  /** Last ready run per country (for /metadata-style lookups). */
  lastCompleted() {
    const result = {}
    for (const run of this.runs.values()) {
      if (run.status !== "ready") continue
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

  reset() {
    for (const timer of this.timers.values()) clearInterval(timer)
    this.timers.clear()
    this.runs.clear()
  }
}

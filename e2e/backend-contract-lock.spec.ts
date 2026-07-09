import { test, expect } from "@playwright/test"
import type { APIRequestContext } from "@playwright/test"
import { MOCK_API_BASE } from "./helpers/config"

/**
 * JAA-894 — regression lock on the execute -> poll -> download contract that
 * `mock-server/routes/{weighting,eligibility}.js` expose. The epic assumes
 * swapping the real execution backend (Databricks <-> ACA) in ms-process-api
 * requires NO frontend change, because the frontend only ever depends on this
 * shape (never on Databricks/ACA specifics). This spec makes that assumption
 * a mechanically-checked contract instead of an implicit belief.
 *
 * Talks to the mock-server directly via `page.request` (same HTTP contract
 * the real Bridge API must satisfy) — no UI/login needed, so it stays fast
 * and immune to unrelated UI churn.
 */

interface RunStepState {
  name: string
  status: string
}

interface WeightingRunBody {
  status: string
  current_step: string | null
  started_at?: string | null
  completed_at?: string | null
  steps: RunStepState[]
  summary_stats?: Record<string, unknown> | null
}

interface EligibilityFile {
  file_id: string
  filename: string
  stage: number
  direction: string
}

interface EligibilityRunBody {
  status: string
  current_step: string | null
  started_at?: string | null
  phase1_metrics_json?: Record<string, unknown> | null
  files: EligibilityFile[]
}

async function pollUntil<T = Record<string, unknown>>(
  request: APIRequestContext,
  url: string,
  predicate: (body: T) => boolean,
  { timeoutMs = 20_000, intervalMs = 50 } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let last: T | undefined
  while (Date.now() < deadline) {
    const res = await request.get(url)
    expect(res.ok()).toBe(true)
    last = (await res.json()) as T
    if (predicate(last)) return last
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(`pollUntil timed out waiting on ${url}. Last body: ${JSON.stringify(last)}`)
}

test.beforeEach(async ({ request }) => {
  await request.post(`${MOCK_API_BASE}/test/reset`)
})

test(
  "weighting: execute -> poll -> download exposes the pending/running/completed contract",
  { tag: "@smoke" },
  async ({ request }) => {
    // --- create (pending) --------------------------------------------------
    const createRes = await request.post(`${MOCK_API_BASE}/weighting/runs`, {
      data: { country: "chile", period: 202601, parameters: {} },
    })
    expect(createRes.status()).toBe(201)
    const created = await createRes.json()
    expect(created).toMatchObject({
      country: "chile",
      period: 202601,
      status: "pending",
      current_step: null,
    })
    expect(typeof created.run_id).toBe("string")
    expect(created.run_id.length).toBeGreaterThan(0)
    expect(Array.isArray(created.steps)).toBe(true)
    expect(created.steps.length).toBeGreaterThan(0)
    for (const step of created.steps) {
      expect(step).toMatchObject({ name: expect.any(String), status: "pending" })
    }
    const runId = created.run_id

    // --- execute (synchronously flips to running) ---------------------------
    const execRes = await request.post(`${MOCK_API_BASE}/weighting/runs/${runId}/execute`)
    expect(execRes.status()).toBe(200)
    const running = await execRes.json()
    expect(running.status).toBe("running")
    expect(typeof running.current_step).toBe("string")
    expect(running.started_at).not.toBeNull()

    // --- poll until completed ------------------------------------------------
    const completed = await pollUntil<WeightingRunBody>(
      request,
      `${MOCK_API_BASE}/weighting/runs/${runId}`,
      (r) => r.status === "completed",
    )
    expect(completed.current_step).toBeNull()
    expect(completed.completed_at).not.toBeNull()
    expect(completed.steps.every((s: RunStepState) => s.status === "completed")).toBe(true)
    expect(completed.summary_stats).not.toBeNull()
    expect(completed.summary_stats).toMatchObject({
      total_households: expect.any(Number),
      mean_weight: expect.any(Number),
    })

    // --- download --------------------------------------------------------
    const downloadRes = await request.get(`${MOCK_API_BASE}/weighting/runs/${runId}/download`)
    expect(downloadRes.status()).toBe(200)
    expect(downloadRes.headers()["content-type"]).toContain("text/csv")
    const csv = await downloadRes.text()
    const lines = csv.trim().split("\n")
    expect(lines[0]).toBe("household_id,country,period,weight,stratum")
    expect(lines.length).toBeGreaterThan(1)
  },
)

test(
  "eligibility: execute -> poll -> download exposes the pending/running/results_ready contract",
  { tag: "@smoke" },
  async ({ request }) => {
    // --- create (pending) --------------------------------------------------
    const createRes = await request.post(`${MOCK_API_BASE}/eligibility/runs`, {
      data: { country: "peru", period: 202601, parameters: {} },
    })
    expect(createRes.status()).toBe(201)
    const created = await createRes.json()
    expect(created).toMatchObject({
      country: "peru",
      period: 202601,
      status: "pending",
      current_step: null,
    })
    expect(typeof created.run_id).toBe("string")
    expect(Array.isArray(created.files)).toBe(true)
    expect(created.files.length).toBe(0)
    const runId = created.run_id

    // --- execute (synchronously flips to running) ---------------------------
    const execRes = await request.post(`${MOCK_API_BASE}/eligibility/runs/${runId}/execute`)
    expect(execRes.status()).toBe(200)
    const running = await execRes.json()
    expect(running.status).toBe("running")
    expect(running.started_at).not.toBeNull()

    // --- poll until the first phase settles on results_ready ----------------
    const resultsReady = await pollUntil<EligibilityRunBody>(
      request,
      `${MOCK_API_BASE}/eligibility/runs/${runId}`,
      (r) => r.status === "results_ready",
    )
    expect(resultsReady.current_step).toBeNull()
    expect(resultsReady.phase1_metrics_json).not.toBeNull()
    expect(resultsReady.phase1_metrics_json).toMatchObject({
      elegibles_naturales: expect.any(Number),
    })
    expect(Array.isArray(resultsReady.files)).toBe(true)
    const resultFile = resultsReady.files.find(
      (f: EligibilityFile) => f.stage === 1 && f.direction === "download",
    )
    expect(resultFile).toBeTruthy()
    expect(typeof resultFile.file_id).toBe("string")
    expect(typeof resultFile.filename).toBe("string")

    // --- download the phase-1 results file -----------------------------------
    const downloadRes = await request.get(
      `${MOCK_API_BASE}/eligibility/runs/${runId}/files/${resultFile.file_id}/download`,
    )
    expect(downloadRes.status()).toBe(200)
    expect(downloadRes.headers()["content-type"]).toContain("text/csv")
    const csv = await downloadRes.text()
    const lines = csv.trim().split("\n")
    expect(lines[0]).toBe("household_id,country,period,eligible,colaboracion")
    expect(lines.length).toBeGreaterThan(1)
  },
)

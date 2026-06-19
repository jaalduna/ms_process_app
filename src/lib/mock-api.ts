/**
 * Mock API adapter — intercepts all axios requests and returns realistic demo data.
 * Activated by VITE_MOCK_API=true at build time.
 *
 * Uses axios `adapter` to short-circuit requests before they hit the network,
 * so the response flows through response interceptors normally.
 */
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios"
import { api } from "./api"

const COUNTRIES = [
  { code: "CL", queries: ["q_compras", "q_hogares", "q_panelistas"], queries_count: 3, type: "country" as const },
  { code: "CO", queries: ["q_compras", "q_hogares"], queries_count: 2, type: "country" as const },
  { code: "MX", queries: ["q_compras", "q_hogares", "q_productos"], queries_count: 3, type: "country" as const },
  { code: "PE", queries: ["q_compras", "q_hogares"], queries_count: 2, type: "country" as const },
  { code: "BR", queries: ["q_compras", "q_hogares", "q_panelistas", "q_productos"], queries_count: 4, type: "country" as const },
  { code: "BO", queries: ["q_compras", "q_hogares"], queries_count: 2, type: "country" as const },
  { code: "EC", queries: ["q_compras", "q_hogares"], queries_count: 2, type: "country" as const },
  { code: "PY", queries: ["q_compras", "q_hogares"], queries_count: 2, type: "country" as const },
]

const STAGES = [
  { code: "sync", name: "Sincronización" },
  { code: "calibration", name: "Calibración" },
  { code: "elegibilidad", name: "Elegibilidad" },
  { code: "prices", name: "Precios" },
  { code: "weighting", name: "Pesaje" },
  { code: "mtr", name: "MTR" },
]

function makeLastSync() {
  const countries: Record<string, unknown> = {}
  for (const c of COUNTRIES) {
    countries[c.code] = {
      country: c.code,
      completed_at: new Date(Date.now() - Math.random() * 7 * 86400000).toISOString(),
      run_id: crypto.randomUUID(),
      period: Number(new Date().toISOString().slice(0, 7).replace("-", "")),
    }
  }
  return { countries }
}

function makeLastStageCompletion() {
  const countries: Record<string, unknown> = {}
  for (const c of COUNTRIES) {
    countries[c.code] = {
      country: c.code,
      completed_at: new Date(Date.now() - Math.random() * 14 * 86400000).toISOString(),
      run_id: crypto.randomUUID(),
      period: 202603,
    }
  }
  return { countries }
}

function makeEvents() {
  const items = COUNTRIES.slice(0, 5).map((c, i) => ({
    job_id: crypto.randomUUID(),
    status: ["completed", "completed", "running", "completed", "failed"][i],
    country: c.code,
    stage: "calibration",
    tag: `${c.code}_202603_demo`,
    period: "202603",
    queries_total: c.queries_count,
    queries_completed: i === 4 ? 1 : c.queries_count,
    queries_failed: i === 4 ? 1 : 0,
    created_at: new Date(Date.now() - (5 - i) * 3600000).toISOString(),
    started_at: new Date(Date.now() - (5 - i) * 3600000 + 5000).toISOString(),
    completed_at: i === 2 ? null : new Date(Date.now() - (5 - i) * 1800000).toISOString(),
    triggered_by: "demo@kantar.com",
    error: i === 4 ? "Timeout en query q_hogares" : null,
    current_query: i === 2 ? "q_hogares" : null,
    failed_queries: i === 4 ? ["q_hogares"] : [],
    running_queries: i === 2 ? ["q_hogares"] : [],
    queries_running: i === 2 ? 1 : 0,
    total_rows_extracted: Math.floor(Math.random() * 500000) + 10000,
  }))
  return { items, total: items.length, limit: 50, offset: 0 }
}

function makeEligibilityRuns() {
  return [
    {
      run_id: crypto.randomUUID(),
      country: "CL",
      period: 202603,
      status: "ready",
      current_step: "complete",
      created_by: "demo@kantar.com",
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      updated_at: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      run_id: crypto.randomUUID(),
      country: "CO",
      period: 202603,
      status: "results_ready",
      current_step: "approve",
      created_by: "demo@kantar.com",
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]
}

function makePricesRuns() {
  return {
    items: [
      {
        run_id: crypto.randomUUID(),
        country: "CL",
        period: 202603,
        status: "approved",
        outliers_count: 12,
        created_by: "demo@kantar.com",
        created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
        updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      },
    ],
    total: 1,
  }
}

function makeWeightingRuns() {
  return [
    {
      run_id: crypto.randomUUID(),
      country: "CL",
      period: 202603,
      status: "completed",
      summary_stats: {
        total_households: 3500,
        weighted_households: 3480,
        min_weight: 0.12,
        max_weight: 4.85,
        mean_weight: 1.0,
        median_weight: 0.95,
        std_dev: 0.42,
      },
      created_by: "demo@kantar.com",
      created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
      updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    },
  ]
}

function makeMtrRuns() {
  return {
    items: [
      {
        run_id: crypto.randomUUID(),
        country: "CL",
        period: 202603,
        status: "completed",
        results_summary: {
          total_targets: 150,
          targets_achieved: 142,
          total_imputations: 8,
          quality_score: 0.95,
        },
        created_by: "demo@kantar.com",
        created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
        updated_at: new Date(Date.now() - 4 * 86400000).toISOString(),
      },
    ],
    total: 1,
  }
}

function makeTags() {
  const items = [
    { table_name: "calibracion_cl", version: 3, tag: "CL_202603_v3", description: "Calibración Chile marzo 2026", created_by: "demo@kantar.com", created_at: new Date(Date.now() - 86400000).toISOString(), job_id: crypto.randomUUID() },
    { table_name: "calibracion_co", version: 2, tag: "CO_202603_v2", description: "Calibración Colombia marzo 2026", created_by: "demo@kantar.com", created_at: new Date(Date.now() - 2 * 86400000).toISOString(), job_id: crypto.randomUUID() },
    { table_name: "calibracion_mx", version: 1, tag: "MX_202603_v1", description: "Calibración México marzo 2026", created_by: "demo@kantar.com", created_at: new Date(Date.now() - 3 * 86400000).toISOString(), job_id: crypto.randomUUID() },
    { table_name: "sincronizacion_br", version: 5, tag: "BR_202603_sync", description: null, created_by: "system", created_at: new Date(Date.now() - 4 * 86400000).toISOString(), job_id: crypto.randomUUID() },
  ]
  return { items, total: items.length, limit: 50, offset: 0 }
}

function makeDataAvailability() {
  return {
    countries: COUNTRIES.map((c) => ({
      country: c.code,
      available: true,
      last_updated: new Date(Date.now() - Math.random() * 7 * 86400000).toISOString(),
      row_count: Math.floor(Math.random() * 1000000) + 50000,
    })),
  }
}

type RouteHandler = (url: string, config: InternalAxiosRequestConfig) => unknown

const routes: [RegExp, RouteHandler][] = [
  [/\/auth\/me$/, () => ({ email: "demo@kantar.com", name: "Demo User", roles: ["admin"], countries: ["CL", "CO", "MX", "PE", "BR", "BO", "EC", "PY"] })],
  [/\/metadata\/countries$/, () => ({ countries: COUNTRIES })],
  [/\/metadata\/stages$/, () => ({ stages: STAGES })],
  [/\/metadata\/data-availability$/, () => makeDataAvailability()],
  [/\/metadata\/last-sync$/, () => makeLastSync()],
  [/\/metadata\/last-calibration$/, () => makeLastSync()],
  [/\/metadata\/last-elegibilidad$/, () => makeLastStageCompletion()],
  [/\/metadata\/last-prices$/, () => makeLastStageCompletion()],
  [/\/metadata\/last-weighting$/, () => makeLastStageCompletion()],
  [/\/metadata\/last-mtr$/, () => makeLastStageCompletion()],
  [/\/events$/, () => makeEvents()],
  [/\/events\/[^/]+$/, () => ({ ...makeEvents().items[0], results: [] })],
  [/\/events\/[^/]+\/tables$/, () => ({ job_id: "demo", country: "CL", tables: [] })],
  [/\/events\/[^/]+\/cancel$/, () => ({ status: "cancelled" })],
  [/\/trigger$/, () => ({ job_id: crypto.randomUUID(), status: "pending", country: "CL", stage: "calibration", tag: "demo", queries: ["q_compras"], queries_count: 1, created_at: new Date().toISOString(), triggered_by: "demo@kantar.com" })],
  [/\/eligibility\/runs$/, () => makeEligibilityRuns()],
  [/\/eligibility\/runs\/[^/]+$/, () => makeEligibilityRuns()[0]],
  [/\/prices\/runs$/, () => makePricesRuns()],
  [/\/prices\/runs\/[^/]+$/, () => makePricesRuns().items[0]],
  [/\/weighting\/runs$/, () => makeWeightingRuns()],
  [/\/weighting\/runs\/[^/]+$/, () => makeWeightingRuns()[0]],
  [/\/mtr\/runs$/, () => makeMtrRuns()],
  [/\/mtr\/runs\/[^/]+$/, () => makeMtrRuns().items[0]],
  [/\/tags$/, () => makeTags()],
  [/\/tags\/[^/]+$/, () => makeTags().items[0]],
]

function matchRoute(url: string, config: InternalAxiosRequestConfig): unknown | undefined {
  for (const [pattern, handler] of routes) {
    if (pattern.test(url)) {
      return handler(url, config)
    }
  }
  return undefined
}

export function installMockApi() {
  // Use a custom adapter that returns mock data instead of making real HTTP requests.
  // This runs BEFORE any response interceptors, so the mock response flows through
  // the normal axios pipeline.
  const originalAdapter = api.defaults.adapter

  api.defaults.adapter = (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const url = config.url ?? ""
    const data = matchRoute(url, config)
    if (data !== undefined) {
      console.debug("[mock-api] matched:", url)
      return Promise.resolve({
        data,
        status: 200,
        statusText: "OK (mock)",
        headers: {},
        config,
      } as AxiosResponse)
    }
    // Not matched — fall through to real adapter (will likely fail in demo mode)
    console.warn("[mock-api] unmatched route:", url)
    if (typeof originalAdapter === "function") {
      return originalAdapter(config)
    }
    return Promise.reject(new Error(`[mock-api] No adapter for: ${url}`))
  }

  console.info("[mock-api] Mock API installed — all backend calls return demo data")
}

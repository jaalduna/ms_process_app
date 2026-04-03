import axios from "axios"
import type {
  ApiError,
  CountriesResponse,
  DataAvailabilityResponse,
  EventDetail,
  EventListResponse,
  LastElegibilidadResponse,
  LastMtrResponse,
  LastStageCompletionResponse,
  LastSyncResponse,
  LastWeightingResponse,
  StagesResponse,
  TablesResponse,
  TriggerRequest,
  TriggerResponse,
  UserInfo,
} from "@/types/api"
import type { EligibilityFile, EligibilityRun, EligibilityRunCreate } from "@/modules/elegibilidad/types"
import type { PricesRun, PricesRunCreate } from "@/modules/precios/types"
import type { WeightingRun, WeightingRunCreate } from "@/modules/pesaje/types"
import type { MtrRun, MtrRunCreate } from "@/modules/mtr/types"
import type { TagListResponse, TagDetail, TagFilters } from "@/modules/trazabilidad/types"

function getBaseUrl(): string {
  return (
    (window as any).__BRIDGE_CONFIG__?.API_URL ??
    import.meta.env.VITE_BRIDGE_API_URL ??
    "http://localhost:8000/api/v1"
  )
}

export const api = axios.create({
  headers: { "Content-Type": "application/json" },
})

// Resolve baseURL lazily so external config.json (loaded async in Tauri)
// is already applied by the time the first request fires.
api.interceptors.request.use((config) => {
  if (!config.baseURL) {
    config.baseURL = getBaseUrl()
  }
  return config
})

/** Set the MSAL token provider as a request interceptor. */
export function setTokenProvider(provider: () => Promise<string>) {
  api.interceptors.request.use(async (config) => {
    const token = await provider()
    config.headers.Authorization = `Bearer ${token}`
    return config
  })
}

/** Transform Axios errors into our ApiError shape. */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.data) {
      const apiError: ApiError = {
        error: error.response.data.error ?? "unknown",
        message: error.response.data.message ?? error.message,
      }
      return Promise.reject(apiError)
    }
    return Promise.reject({
      error: "network_error",
      message: error.message ?? "Network error",
    } satisfies ApiError)
  },
)

// -- Auth --

export function getMe() {
  return api.get<UserInfo>("/auth/me").then((r) => r.data)
}

// -- Trigger --

export function triggerSync(body: TriggerRequest) {
  return api.post<TriggerResponse>("/trigger", body).then((r) => r.data)
}

/** Alias for triggerSync for calibration_frontend compatibility. */
export const triggerCalibration = triggerSync

// -- Events --

export function getEvents(params?: {
  country?: string
  status?: string
  stage?: string
  period?: string
  limit?: number
  offset?: number
}) {
  return api.get<EventListResponse>("/events", { params }).then((r) => r.data)
}

export function getEvent(jobId: string) {
  return api.get<EventDetail>(`/events/${jobId}`).then((r) => r.data)
}

export function cancelJob(jobId: string) {
  return api.post<EventDetail>(`/events/${jobId}/cancel`).then((r) => r.data)
}

// -- Metadata --

export function getCountries() {
  return api.get<CountriesResponse>("/metadata/countries").then((r) => r.data)
}

export function getStages() {
  return api.get<StagesResponse>("/metadata/stages").then((r) => r.data)
}

export function getDataAvailability(period: string) {
  return api
    .get<DataAvailabilityResponse>("/metadata/data-availability", { params: { period } })
    .then((r) => r.data)
}

export function getLastSync(stage?: string, minQueries?: number) {
  const params: Record<string, string> = {}
  if (stage) params.stage = stage
  if (minQueries && minQueries > 0) params.min_queries = String(minQueries)
  return api.get<LastSyncResponse>("/metadata/last-sync", { params }).then((r) => r.data)
}

export function getLastCalibration() {
  return api.get<LastSyncResponse>("/metadata/last-calibration").then((r) => r.data)
}

export function getLastElegibilidad() {
  return api.get<LastElegibilidadResponse>("/metadata/last-elegibilidad").then((r) => r.data)
}

export function getLastPrices() {
  return api.get<LastStageCompletionResponse>("/metadata/last-prices").then((r) => r.data)
}

export function getLastWeighting() {
  return api.get<LastStageCompletionResponse>("/metadata/last-weighting").then((r) => r.data)
}

export function getLastMtr() {
  return api.get<LastStageCompletionResponse>("/metadata/last-mtr").then((r) => r.data)
}

// -- Eligibility --

export function getEligibilityRuns(params?: {
  country?: string
  period?: number
  status?: string
  limit?: number
  offset?: number
}) {
  return api.get<{ items: EligibilityRun[]; total: number }>("/eligibility/runs", { params }).then((r) => r.data.items)
}

export function getEligibilityRun(runId: string) {
  return api.get<EligibilityRun>(`/eligibility/runs/${runId}`).then((r) => r.data)
}

export function createEligibilityRun(data: EligibilityRunCreate) {
  return api.post<EligibilityRun>("/eligibility/runs", data).then((r) => r.data)
}

export function updateEligibilityRun(runId: string, data: Partial<EligibilityRun>) {
  return api.patch<EligibilityRun>(`/eligibility/runs/${runId}`, data).then((r) => r.data)
}

export function deleteEligibilityRun(runId: string) {
  return api.delete(`/eligibility/runs/${runId}`).then((r) => r.data)
}

export function executeEligibility(runId: string) {
  return api.post<EligibilityRun>(`/eligibility/runs/${runId}/execute`).then((r) => r.data)
}

export function approveEligibility(runId: string) {
  return api.post<EligibilityRun>(`/eligibility/runs/${runId}/approve`).then((r) => r.data)
}

export function applyMordom(runId: string) {
  return api.post<EligibilityRun>(`/eligibility/runs/${runId}/apply-mordom`).then((r) => r.data)
}

export function getEligibilityFiles(runId: string) {
  return api.get<EligibilityFile[]>(`/eligibility/runs/${runId}/files`).then((r) => r.data)
}

export async function downloadEligibilityFile(runId: string, fileId: string, filename: string): Promise<void> {
  const response = await api.get(`/eligibility/runs/${runId}/files/${fileId}/download`, { responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

export async function uploadEligibilityFiles(runId: string, file: File): Promise<EligibilityFile> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post<EligibilityFile>(`/eligibility/runs/${runId}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export function cancelEligibility(runId: string) {
  return api.post<EligibilityRun>(`/eligibility/runs/${runId}/cancel`).then((r) => r.data)
}

// -- Prices --

export function getPricesRuns(params?: {
  country?: string
  period?: number
  status?: string
  limit?: number
  offset?: number
}) {
  return api.get<{ items: PricesRun[]; total: number }>("/prices/runs", { params }).then((r) => r.data)
}

export function getPricesRun(runId: string) {
  return api.get<PricesRun>(`/prices/runs/${runId}`).then((r) => r.data)
}

export function createPricesRun(data: PricesRunCreate) {
  return api.post<PricesRun>("/prices/runs", data).then((r) => r.data)
}

export function executePrices(runId: string) {
  return api.post<PricesRun>(`/prices/runs/${runId}/execute`).then((r) => r.data)
}

export function approvePrices(runId: string) {
  return api.post<PricesRun>(`/prices/runs/${runId}/approve`).then((r) => r.data)
}

export function cancelPrices(runId: string) {
  return api.post<PricesRun>(`/prices/runs/${runId}/cancel`).then((r) => r.data)
}

// -- Weighting --

export function getWeightingRuns(params?: {
  country?: string
  period?: number
  status?: string
  limit?: number
  offset?: number
}) {
  return api.get<{ items: WeightingRun[]; total: number }>("/weighting/runs", { params }).then((r) => r.data.items)
}

export function getWeightingRun(runId: string) {
  return api.get<WeightingRun>(`/weighting/runs/${runId}`).then((r) => r.data)
}

export function createWeightingRun(data: WeightingRunCreate) {
  return api.post<WeightingRun>("/weighting/runs", data).then((r) => r.data)
}

export function executeWeighting(runId: string) {
  return api.post<WeightingRun>(`/weighting/runs/${runId}/execute`).then((r) => r.data)
}

export function cancelWeighting(runId: string) {
  return api.post<WeightingRun>(`/weighting/runs/${runId}/cancel`).then((r) => r.data)
}

export async function downloadWeightingCSV(runId: string): Promise<void> {
  const response = await api.get(`/weighting/runs/${runId}/download`, { responseType: "blob" })
  const url = URL.createObjectURL(new Blob([response.data]))
  const a = document.createElement("a")
  a.href = url
  const disposition = response.headers["content-disposition"] ?? ""
  const match = disposition.match(/filename="?([^";\n]+)"?/)
  a.download = match?.[1] ?? `weighting_${runId.slice(0, 8)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// -- MTR --

export function getMtrRuns(params?: {
  country?: string
  period?: number
  status?: string
  limit?: number
  offset?: number
}) {
  return api.get<{ items: MtrRun[]; total: number }>("/mtr/runs", { params }).then((r) => r.data)
}

export function getMtrRun(runId: string) {
  return api.get<MtrRun>(`/mtr/runs/${runId}`).then((r) => r.data)
}

export function createMtrRun(data: MtrRunCreate) {
  return api.post<MtrRun>("/mtr/runs", data).then((r) => r.data)
}

export function executeMtr(runId: string) {
  return api.post<MtrRun>(`/mtr/runs/${runId}/execute`).then((r) => r.data)
}

export function cancelMtr(runId: string) {
  return api.post<MtrRun>(`/mtr/runs/${runId}/cancel`).then((r) => r.data)
}

// -- Traceability --

export function getTags(params?: TagFilters & { limit?: number; offset?: number }) {
  return api.get<TagListResponse>("/traceability/tags", { params }).then((r) => r.data)
}

export function getTagDetail(tagId: string) {
  return api.get<TagDetail>(`/traceability/tags/${tagId}`).then((r) => r.data)
}

export async function downloadTagTableCSV(tagId: string, tableName: string): Promise<void> {
  const response = await api.get(`/traceability/tags/${tagId}/tables/${tableName}/download`, { responseType: "blob" })
  const url = URL.createObjectURL(new Blob([response.data]))
  const a = document.createElement("a")
  a.href = url
  const disposition = response.headers["content-disposition"] ?? ""
  const match = disposition.match(/filename="?([^";\n]+)"?/)
  a.download = match?.[1] ?? `${tableName}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function downloadTagZip(tagId: string): Promise<void> {
  const response = await api.get(`/traceability/tags/${tagId}/download`, { responseType: "blob" })
  const url = URL.createObjectURL(new Blob([response.data]))
  const a = document.createElement("a")
  a.href = url
  const disposition = response.headers["content-disposition"] ?? ""
  const match = disposition.match(/filename="?([^";\n]+)"?/)
  a.download = match?.[1] ?? `tag_${tagId}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// -- Downloads --

export function getJobTables(jobId: string) {
  return api.get<TablesResponse>(`/events/${jobId}/tables`).then((r) => r.data)
}

export async function downloadCSV(jobId: string, table?: string): Promise<void> {
  const params = table ? { table } : undefined
  const response = await api.get(`/events/${jobId}/download`, { responseType: "blob", params })
  const url = URL.createObjectURL(new Blob([response.data]))
  const a = document.createElement("a")
  a.href = url

  // Parse filename from Content-Disposition header, fall back to generic name
  const disposition = response.headers["content-disposition"] ?? ""
  const match = disposition.match(/filename="?([^";\n]+)"?/)
  a.download = match?.[1] ?? `calibration_${jobId.slice(0, 8)}.csv`

  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

import axios from "axios"
import type {
  ApiError,
  CountriesResponse,
  DataAvailabilityResponse,
  EventDetail,
  EventListResponse,
  FeedbackPayload,
  FeedbackResponse,
  LastElegibilidadResponse,
  LastStageCompletionResponse,
  LastSyncResponse,
  ProcessConfigResponse,
  ProcessEntry,
  ProcessStage,
  ProcessStatusResponse,
  StagesResponse,
  TriggerRequest,
  TriggerResponse,
  UserInfo,
} from "@/types/api"
import type { EligibilityFile, EligibilityRun, EligibilityRunCreate } from "@/modules/elegibilidad/types"
import type { PricesRun, PricesRunCreate } from "@/modules/precios/types"
import type { WeightingRun, WeightingRunCreate } from "@/modules/pesaje/types"
import type { MtrRun, MtrRunCreate } from "@/modules/mtr/types"
import type { Formato4Run, Formato4RunCreate } from "@/modules/formato4/types"
import type { TagListResponse, TagFilters } from "@/modules/trazabilidad/types"
import type {
  AdminStage,
  AuthorizedUser,
  JobsConfig,
  StageItem,
  UserBody,
} from "@/modules/admin/types"

function getBaseUrl(): string {
  return (
    (window as unknown as { __BRIDGE_CONFIG__?: { API_URL?: string } }).__BRIDGE_CONFIG__?.API_URL ??
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

/** Resolve a signed-download-url response's server-relative `url` (e.g.
 * "/api/v1/calibration/tag1/download-signed?...") against the API's origin —
 * NOT against `api`'s baseURL, which already includes the "/api/v1" prefix
 * the backend's `url` also carries (JAA-757/758). */
function resolveDownloadUrl(relativeUrl: string): string {
  return new URL(relativeUrl, new URL(getBaseUrl(), window.location.origin).origin).toString()
}

interface SignedDownloadUrl {
  url: string
  expires_in: number
}

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

// -- Feedback (JAA-427) --

/** Submit in-app user feedback. Resolves with { id, createdAt } on 201;
 * rejects with ApiError (e.g. 400 for an empty message). */
export function submitFeedback(payload: FeedbackPayload) {
  return api.post<FeedbackResponse>("/feedback", payload).then((r) => r.data)
}

// -- Shared process config (JAA-642) --

/** GET the shared default config for a process (mtr/calibration/prices/...).
 * Pass a non-default `scope` (e.g. a country code, JAA-667) to read a per-scope row. */
export function getProcessConfig(process: string, scope?: string) {
  return api
    .get<ProcessConfigResponse>(`/config/processes/${encodeURIComponent(process)}`, {
      params: scope ? { scope } : undefined,
    })
    .then((r) => r.data)
}

/** PUT (upsert) the shared default config for a process. 403 if not a process admin.
 * Pass a non-default `scope` (e.g. a country code, JAA-667) to upsert a per-scope row. */
export function putProcessConfig(
  process: string,
  config: Record<string, unknown>,
  scope?: string,
) {
  return api
    .put<ProcessConfigResponse>(
      `/config/processes/${encodeURIComponent(process)}`,
      { config },
      { params: scope ? { scope } : undefined },
    )
    .then((r) => r.data)
}

// -- Trigger --

export function triggerSync(body: TriggerRequest) {
  return api.post<TriggerResponse>("/trigger", body).then((r) => r.data)
}

/** Alias for triggerSync for calibration_frontend compatibility. */
export const triggerCalibration = triggerSync

// -- Calibration runs (JAA-648) --

/**
 * List calibration runs from the shared, server-authoritative backend run store
 * (JAA-647 lifecycle in process_runs). Mirrors the mtr/prices runs pattern: the
 * active run is derived as `items[0]` (newest first) instead of from per-browser
 * localStorage, so the running state is recovered after reload and shared across
 * browsers/users.
 */
export function getCalibrationRuns(params?: {
  country?: string
  period?: string
  status?: string
  limit?: number
  offset?: number
}) {
  return api
    .get<EventListResponse>("/calibration/runs", { params })
    .then((r) => r.data)
}

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

/** JAA-755: mark/unmark a run as final and/or set its free-text label */
export function patchEvent(jobId: string, patch: { is_final?: boolean; label?: string }) {
  return api.patch<EventDetail>(`/events/${jobId}`, patch).then((r) => r.data)
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

// `period` (YYYYMM) restricts each last-completion lookup to runs of that
// period; omit it for the latest run overall (backward compatible). See JAA-421.
function periodParams(period?: number) {
  return period != null ? { params: { period: String(period) } } : undefined
}

export function getLastCalibration(period?: number) {
  return api.get<LastSyncResponse>("/metadata/last-calibration", periodParams(period)).then((r) => r.data)
}

export function getLastElegibilidad(period?: number) {
  return api.get<LastElegibilidadResponse>("/metadata/last-elegibilidad", periodParams(period)).then((r) => r.data)
}

export function getLastPrices(period?: number) {
  return api.get<LastStageCompletionResponse>("/metadata/last-prices", periodParams(period)).then((r) => r.data)
}

export function getLastWeighting(period?: number) {
  return api.get<LastStageCompletionResponse>("/metadata/last-weighting", periodParams(period)).then((r) => r.data)
}

export function getLastMtr(period?: number) {
  return api.get<LastStageCompletionResponse>("/metadata/last-mtr", periodParams(period)).then((r) => r.data)
}

// -- Process open/close (per stage, per country) --

export function getProcessStatus() {
  return api.get<ProcessStatusResponse>("/processes/status").then((r) => r.data)
}

export function openProcess(stage: ProcessStage, country: string) {
  return api
    .post<ProcessEntry>(`/processes/${stage}/${country}/open`)
    .then((r) => r.data)
}

export function closeProcess(stage: ProcessStage, country: string) {
  return api
    .post<ProcessEntry>(`/processes/${stage}/${country}/close`)
    .then((r) => r.data)
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

/** JAA-755: mark/unmark a run as final and/or set its free-text label */
export function patchWeightingRun(runId: string, patch: { is_final?: boolean; label?: string }) {
  return api.patch<WeightingRun>(`/weighting/runs/${runId}`, patch).then((r) => r.data)
}

// JAA-757/758: native browser download via a short-lived signed URL, instead
// of axios-blob (which buffers the whole file in page memory and shows no
// native progress). We fetch the signed URL (authenticated as usual) then
// navigate the browser to it directly — the download-signed endpoint needs
// no Authorization header, which is what native navigation can't send.
export async function downloadWeightingCSV(runId: string): Promise<void> {
  const { data } = await api.get<SignedDownloadUrl>(`/weighting/runs/${runId}/download-url`)
  window.location.assign(resolveDownloadUrl(data.url))
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

// -- Formato 4 --
// Mirrors the MTR lifecycle (MTR-29). The mock-server formato4 routes (MTR-27)
// expose the same shape, so the cloned hooks work unchanged. The zip download
// fn (downloadFormato4Report) lands separately in MTR-32.

export function getFormato4Runs(params?: {
  country?: string
  period?: number
  status?: string
  limit?: number
  offset?: number
}) {
  return api.get<{ items: Formato4Run[]; total: number }>("/formato4/runs", { params }).then((r) => r.data)
}

export function getFormato4Run(runId: string) {
  return api.get<Formato4Run>(`/formato4/runs/${runId}`).then((r) => r.data)
}

export function createFormato4Run(data: Formato4RunCreate) {
  return api.post<Formato4Run>("/formato4/runs", data).then((r) => r.data)
}

export function executeFormato4(runId: string) {
  return api.post<Formato4Run>(`/formato4/runs/${runId}/execute`).then((r) => r.data)
}

export function cancelFormato4(runId: string) {
  return api.post<Formato4Run>(`/formato4/runs/${runId}/cancel`).then((r) => r.data)
}

export function getLastFormato4(period?: number) {
  return api.get<LastStageCompletionResponse>("/metadata/last-formato4", periodParams(period)).then((r) => r.data)
}

// MTR-32: download the server-generated result zip by runId. Clones the
// weighting by-runId pattern (downloadWeightingCSV) — a blob GET + anchor-click
// + revokeObjectURL — NOT the client-side CSV builder (downloadMtrCsv). The
// `country` arg only seeds the fallback filename; the endpoint keys on runId.
export async function downloadFormato4(runId: string, country: string): Promise<void> {
  const response = await api.get(`/formato4/runs/${runId}/download`, { responseType: "blob" })
  const url = URL.createObjectURL(new Blob([response.data]))
  const a = document.createElement("a")
  a.href = url
  const disposition = response.headers["content-disposition"] ?? ""
  const match = disposition.match(/filename="?([^";\n]+)"?/)
  a.download = match?.[1] ?? `format_4_${country}.csv.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// -- Traceability --

export function getTags(params?: TagFilters & { limit?: number; offset?: number }) {
  return api.get<TagListResponse>("/tags", { params }).then((r) => r.data)
}

export function getTagDetail(tagId: string) {
  return api.get(`/tags/${tagId}`).then((r) => r.data)
}

export async function downloadTagTableCSV(tagId: string, tableName: string): Promise<void> {
  const response = await api.get(`/tags/${tagId}/tables/${tableName}/download`, { responseType: "blob" })
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
  const response = await api.get(`/tags/${tagId}/download`, { responseType: "blob" })
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

// -- Admin (requires admin role) --

export function getAdminUsers() {
  return api.get<{ users: AuthorizedUser[] }>("/admin/users").then((r) => r.data.users)
}

export function putAdminUser(email: string, body: UserBody) {
  return api.put<AuthorizedUser>(`/admin/users/${encodeURIComponent(email)}`, body).then((r) => r.data)
}

export function deleteAdminUser(email: string) {
  return api
    .delete<{ deleted: boolean; email: string }>(`/admin/users/${encodeURIComponent(email)}`)
    .then((r) => r.data)
}

export function getAdminJobs() {
  return api.get<JobsConfig>("/admin/jobs").then((r) => r.data)
}

export function putAdminJob(process: string, country: string, jobId: number) {
  return api
    .put<{ process: string; country: string; job_id: number }>(
      `/admin/jobs/${encodeURIComponent(process)}/${encodeURIComponent(country)}`,
      { job_id: jobId },
    )
    .then((r) => r.data)
}

export function deleteAdminJob(process: string, country: string) {
  return api
    .delete<{ deleted: boolean; process: string; country: string }>(
      `/admin/jobs/${encodeURIComponent(process)}/${encodeURIComponent(country)}`,
    )
    .then((r) => r.data)
}

export function putAdminJobDefaults(defaults: { catalog?: string; results_volume_template?: string }) {
  return api.put<Record<string, string>>("/admin/jobs/defaults", defaults).then((r) => r.data)
}

export function getAdminStages() {
  return api.get<{ stages: AdminStage[] }>("/admin/stages").then((r) => r.data.stages)
}

export function putAdminStage(code: string, body: { name: string; position?: number }) {
  return api.put<AdminStage>(`/admin/stages/${encodeURIComponent(code)}`, body).then((r) => r.data)
}

export function putAdminStages(stages: StageItem[]) {
  return api.put<{ stages: AdminStage[] }>("/admin/stages", { stages }).then((r) => r.data.stages)
}

export function deleteAdminStage(code: string) {
  return api
    .delete<{ deleted: boolean; code: string }>(`/admin/stages/${encodeURIComponent(code)}`)
    .then((r) => r.data)
}

export function adminReload() {
  return api.post<{ reloaded: boolean }>("/admin/reload").then((r) => r.data)
}

// -- Downloads --

// JAA-757/758: native browser download via a short-lived signed URL — see
// downloadWeightingCSV above for the rationale.
export async function downloadCalibrationReport(tag: string, country: string): Promise<void> {
  const { data } = await api.get<SignedDownloadUrl>(`/calibration/${encodeURIComponent(tag)}/download-url`, {
    params: { country },
  })
  window.location.assign(resolveDownloadUrl(data.url))
}

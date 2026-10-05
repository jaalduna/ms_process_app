import { api, resolveDownloadUrl, type SignedDownloadUrl } from "@/lib/api"
import type { QmsTrRun, QmsTrRunCreate, QmsTrSnapshot } from "./types"

export function getQmsTrRuns(params?: { country?: string; limit?: number }) {
  return api
    .get<{ items: QmsTrRun[]; total: number }>("/qms_tr/runs", { params })
    .then((r) => r.data)
}

export function getQmsTrRun(runId: string) {
  return api.get<QmsTrRun>(`/qms_tr/runs/${runId}`).then((r) => r.data)
}

/** Snapshot de J que usaría una corrida con este instante (se muestra antes de confirmar). */
export function resolveQmsTrSnapshot(country: string, at: string) {
  return api
    .get<QmsTrSnapshot>("/qms_tr/snapshots/resolve", { params: { country, at } })
    .then((r) => r.data)
}

/** Crea la corrida; si el snapshot ya existe la API la dispara en el mismo request. */
export function createQmsTrRun(data: QmsTrRunCreate) {
  return api.post<QmsTrRun>("/qms_tr/runs", data).then((r) => r.data)
}

export function cancelQmsTrRun(runId: string) {
  return api.post<QmsTrRun>(`/qms_tr/runs/${runId}/cancel`).then((r) => r.data)
}

export function validateQmsTrRun(runId: string, sampleSize?: number) {
  return api
    .post<QmsTrRun>(`/qms_tr/runs/${runId}/validate`, sampleSize ? { sample_size: sampleSize } : {})
    .then((r) => r.data)
}

/** Descarga nativa con URL firmada (sin header Authorization), patrón calibración/elegibilidad. */
export async function downloadQmsTrZip(runId: string): Promise<void> {
  const { data } = await api.get<SignedDownloadUrl>(`/qms_tr/runs/${runId}/download-url`)
  window.location.assign(resolveDownloadUrl(data.url))
}

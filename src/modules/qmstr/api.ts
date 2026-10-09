import { api, resolveDownloadUrl, type SignedDownloadUrl } from "@/lib/api"
import type {
  FlujoBase,
  FlujoAviso,
  FlujoEstado,
  FlujoPais,
  FlujoPeriodo,
  QmsTrRun,
  QmsTrRunCreate,
  QmsTrSnapshot,
  Tanda,
  TandaCreate,
  TandaProgreso,
  TandaRevertir,
} from "./types"

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

// -- Flujo automático (JAA-1435): /qmstr_flujo -------------------------------------------------------------

const FLUJO = "/qmstr_flujo"

export const getFlujoEstado = () => api.get<FlujoEstado>(`${FLUJO}/estado`).then((r) => r.data)
export const getFlujoPaises = () => api.get<FlujoPais[]>(`${FLUJO}/paises`).then((r) => r.data)
export const getFlujoPeriodos = (pais: string) =>
  api.get<FlujoPeriodo[]>(`${FLUJO}/periodos`, { params: { pais } }).then((r) => r.data)
export const getFlujoBases = (pais: string, periodo: string) =>
  api.get<FlujoBase[]>(`${FLUJO}/bases`, { params: { pais, periodo } }).then((r) => r.data)
export const getTandas = (params: { pais?: string; periodo?: string; tipo?: string; estado?: string }) =>
  api.get<Tanda[]>(`${FLUJO}/tandas`, { params }).then((r) => r.data)
export const getTandaProgreso = (tid: string) =>
  api.get<TandaProgreso>(`${FLUJO}/tandas/${tid}/progreso`).then((r) => r.data)
export const getFlujoAvisos = (pais: string, periodo: string) =>
  api.get<FlujoAviso[]>(`${FLUJO}/avisos`, { params: { pais, periodo } }).then((r) => r.data)

export const crearTanda = (data: TandaCreate) => api.post<Tanda>(`${FLUJO}/tandas`, data).then((r) => r.data)
export const revertirTanda = (tid: string, data: TandaRevertir) =>
  api.post<Tanda>(`${FLUJO}/tandas/${tid}/revertir`, data).then((r) => r.data)

export type AccionTanda = "pausar" | "reanudar" | "reintentar" | "simular_cierre_ticket"
export const accionTanda = (tid: string, accion: AccionTanda) =>
  api.post<Tanda>(`${FLUJO}/tandas/${tid}/${accion}`).then((r) => r.data)

export const forzarVuelta = () => api.post<Record<string, string>>(`${FLUJO}/vuelta`).then((r) => r.data)

/** Descarga el zip de la tanda (corrida o reversión) con la URL firmada (patrón JAA-757). */
export async function downloadTandaZip(tid: string): Promise<void> {
  const { data } = await api.get<SignedDownloadUrl>(`${FLUJO}/tandas/${tid}/zip`)
  window.location.assign(resolveDownloadUrl(data.url))
}

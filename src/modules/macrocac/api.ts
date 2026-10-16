// JAA-1051 — macrocac API client. Talks to the JAA-1048 mock (in-repo, base
// /api/v1/macrocac) or the real ms-process-api (JAA-1052) once it lands.

import { api, resolveDownloadUrl, type SignedDownloadUrl } from "@/lib/api"
import { MacrocacApiError } from "./types"
import type {
  MacrocacCatalogoError,
  MacrocacMotivoList,
  MacrocacRun,
  MacrocacRunError,
  MacrocacTablaList,
  MacrocacTablasError,
  MacrocacUpload,
  MacrocacUploadError,
  MacrocacVistaPrevia,
  MacrocacVistaPreviaError,
} from "./types"

/**
 * Upload a correction `.xlsx`. The mock has no multipart parser — `filename`,
 * `pais`, and `tabla` travel via query string (the same convention as
 * eligibility.js/weighting-params.js); the file itself still goes as
 * multipart form data for the real backend (JAA-1052) to read.
 */
export async function uploadMacrocacFile(params: {
  pais: string
  tabla: string
  /**
   * MotivoCambio de formulario. Opcional desde JAA-1110: manda el motivo de
   * cada fila, y este es el fallback de las que traen la celda vacía. El
   * backend responde `400 motivo_requerido` si hace falta y no viene.
   */
  motivo?: string
  /** Motivo_Otros — detalle libre opcional. */
  auxiliar?: string
  file: File
}): Promise<MacrocacUpload> {
  const { pais, tabla, motivo, auxiliar, file } = params
  const formData = new FormData()
  formData.append("file", file)

  const query = new URLSearchParams({ filename: file.name, pais, tabla })
  if (motivo) query.set("motivo", motivo)
  if (auxiliar?.trim()) query.set("auxiliar", auxiliar.trim())

  const response = await api.post(`/macrocac/uploads?${query.toString()}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    // Bypass the shared interceptor's {error,message}-only error transform
    // (see MacrocacApiError) so 422 missing_columns / 400 bad_request bodies
    // reach the caller intact.
    validateStatus: () => true,
  })
  if (response.status === 201) return response.data as MacrocacUpload
  throw new MacrocacApiError<MacrocacUploadError>(response.status, response.data)
}

/** Estado actual de los actos del lote, antes de aplicar (solo lectura). */
export async function getVistaPrevia(uploadId: string): Promise<MacrocacVistaPrevia> {
  const response = await api.get(`/macrocac/uploads/${uploadId}/vista-previa`, {
    validateStatus: () => true,
  })
  if (response.status === 200) return response.data as MacrocacVistaPrevia
  throw new MacrocacApiError<MacrocacVistaPreviaError>(response.status, response.data)
}

export interface CreateMacrocacRunParams {
  uploadId: string
  /** Validar y reportar sin escribir. */
  simular?: boolean
  /** El usuario ya vio las advertencias del lote y decide seguir. */
  confirmarAdvertencias?: boolean
}

/** Trigger an execution against a previously uploaded correction file. */
export async function createMacrocacRun({
  uploadId,
  simular = false,
  confirmarAdvertencias = false,
}: CreateMacrocacRunParams): Promise<MacrocacRun> {
  const response = await api.post(
    "/macrocac/runs",
    { upload_id: uploadId, simular, confirmar_advertencias: confirmarAdvertencias },
    { validateStatus: () => true },
  )
  if (response.status === 201) return response.data as MacrocacRun
  throw new MacrocacApiError<MacrocacRunError>(response.status, response.data)
}

/** Estado actual del run. Se pollea hasta que llega a un estado terminal. */
export async function getMacrocacRun(runId: string): Promise<MacrocacRun> {
  const response = await api.get(`/macrocac/runs/${runId}`, { validateStatus: () => true })
  if (response.status === 200) return response.data as MacrocacRun
  throw new MacrocacApiError<MacrocacRunError>(response.status, response.data)
}

/**
 * Descarga el Excel de reporte que generó el motor y dispara el "guardar como"
 * del navegador.
 *
 * El backend responde 409 mientras el run no esté `succeeded`, así que el botón
 * solo debe ofrecerse en ese estado. El nombre del archivo se toma del
 * `Content-Disposition` que manda el backend (`reporte_<pais>.xlsx`); si no
 * viniera, caemos a un nombre derivado del run.
 */
/**
 * Descarga el reporte que generó el motor.
 *
 * Se navega a la URL en vez de traerse el archivo por XHR a un Blob: así el
 * navegador hace la descarga él mismo, con streaming y su barra de progreso
 * nativa, y no hay que sostener el archivo entero en memoria de la pestaña.
 *
 * Antes de navegar se pregunta con HEAD, porque una navegación fallida
 * mostraría el JSON de error crudo en una pestaña en vez del error de la UI.
 * Si el HEAD no da 200, se hace un GET para recuperar el {error, message} del
 * backend y se lanza como MacrocacApiError, igual que el resto del módulo.
 *
 * TODO(auth): cuando haya auth real, una navegación directa no lleva el token;
 * ahí habrá que firmar la URL o volver a XHR con streaming manual.
 */
export async function downloadMacrocacReporte(params: {
  runId: string
  pais: string
}): Promise<void> {
  const { runId } = params

  // La URL firmada hace de sonda: si el run no terminó o el archivo no está,
  // esto responde 409/404 con el detalle y no llega a navegar. Antes eso era un
  // HEAD aparte; ahora es la misma llamada que autoriza la descarga.
  const firmada = await api.get<SignedDownloadUrl | MacrocacRunError>(
    `/macrocac/runs/${runId}/reporte/download-url`,
    { validateStatus: () => true },
  )
  if (firmada.status !== 200) {
    throw new MacrocacApiError<MacrocacRunError>(firmada.status, firmada.data as MacrocacRunError)
  }

  window.location.assign(resolveDownloadUrl((firmada.data as SignedDownloadUrl).url))
}

export async function getMotivos(pais: string): Promise<MacrocacMotivoList> {
  const response = await api.get("/macrocac/motivos", {
    params: { pais },
    validateStatus: () => true,
  })
  if (response.status === 200) return response.data as MacrocacMotivoList
  throw new MacrocacApiError<MacrocacCatalogoError>(response.status, response.data)
}

/**
 * Descarga la plantilla de correcciones.
 *
 * Vía URL firmada (JAA-757), no navegando directo a `/macrocac/plantilla`: esa
 * ruta exige el header Authorization y una navegación nativa no puede mandarlo,
 * así que con SSO activo el navegador guardaba el JSON del 401 como
 * `plantilla.json`. Se pide primero la URL firmada —esa llamada sí lleva el
 * token, por el interceptor— y recién después se navega.
 */
export async function downloadPlantilla(): Promise<void> {
  const { data } = await api.get<SignedDownloadUrl>("/macrocac/plantilla/download-url")
  window.location.assign(resolveDownloadUrl(data.url))
}

/**
 * Tablas disponibles para el país: el backend expande contra `sys.tables` los
 * patrones declarados en la planilla. Se pide por país porque cada uno tiene su
 * propia base (`COUNTRY_SQL`), así que la lista no es la misma en todos.
 */
export async function getTablas(pais: string): Promise<MacrocacTablaList> {
  const response = await api.get("/macrocac/tablas", {
    params: { pais },
    validateStatus: () => true,
  })
  if (response.status === 200) return response.data as MacrocacTablaList
  throw new MacrocacApiError<MacrocacTablasError>(response.status, response.data)
}

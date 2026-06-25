// JAA-581 — weighting-params API client. Talks to the real ms-process-api
// (JAA-576/578/579) or the in-repo mock-server, both under
// /api/v1/weighting/params/{pais}/...

import { api } from "@/lib/api"
import type {
  IdPesoConfigResponse,
  PublishableTable,
  PublishResponse,
  UniversoPublishResponse,
  UniversoResponse,
  UniversoUploadResponse,
  ValidateResponse,
  WeightingParamsPayload,
  WeightingVariablesResponse,
} from "./types"

export async function getIdPesoConfig(pais: string): Promise<IdPesoConfigResponse> {
  const { data } = await api.get<IdPesoConfigResponse>(`/weighting/params/${pais}/idpeso-config`)
  return data
}

export async function getWeightingVariables(pais: string): Promise<WeightingVariablesResponse> {
  const { data } = await api.get<WeightingVariablesResponse>(`/weighting/params/${pais}/variables`)
  return data
}

export async function getUniverso(pais: string): Promise<UniversoResponse> {
  const { data } = await api.get<UniversoResponse>(`/weighting/params/${pais}/universo`)
  return data
}

export async function validateWeightingParams(
  pais: string,
  tabla: string,
  payload: WeightingParamsPayload,
): Promise<ValidateResponse> {
  const { data } = await api.post<ValidateResponse>(`/weighting/params/${pais}/${tabla}/validate`, payload)
  return data
}

export async function publishWeightingParams(
  pais: string,
  tabla: PublishableTable,
  payload: WeightingParamsPayload,
): Promise<PublishResponse> {
  const { data } = await api.post<PublishResponse>(`/weighting/params/${pais}/${tabla}/publish`, payload)
  return data
}

// ---- Universo Excel upload flow (JAA-580 / JAA-583) -----------------------

/** Upload the Universo `.xlsx` for parsing + validation. The backend parses the
 *  country sheet (openpyxl) and returns validation + a preview diff; the mock
 *  stubs valid/invalid by filename (no multipart parser), so the filename is
 *  passed as a query param. */
export async function uploadUniverso(pais: string, file: File): Promise<UniversoUploadResponse> {
  const formData = new FormData()
  formData.append("file", file)
  const { data } = await api.post<UniversoUploadResponse>(
    `/weighting/params/${pais}/universo/upload?filename=${encodeURIComponent(file.name)}`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  )
  return data
}

/** Confirm a previously validated upload_token → write a new versioned Universo. */
export async function publishUniverso(pais: string, uploadToken: string): Promise<UniversoPublishResponse> {
  const { data } = await api.post<UniversoPublishResponse>(
    `/weighting/params/${pais}/universo/publish`,
    { upload_token: uploadToken },
  )
  return data
}

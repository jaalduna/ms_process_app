// JAA-581 — weighting-params API client. Talks to the real ms-process-api
// (JAA-576/578/579) or the in-repo mock-server, both under
// /api/v1/weighting/params/{pais}/...

import { api } from "@/lib/api"
import type {
  IdPesoConfigResponse,
  PublishableTable,
  PublishResponse,
  UniversoResponse,
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

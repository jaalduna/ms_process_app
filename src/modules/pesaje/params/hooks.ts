// JAA-581 — react-query hooks for the weighting-params editor (replaces the
// in-file mockData of the original mockup).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  getIdPesoConfig,
  getUniverso,
  getWeightingVariables,
  publishWeightingParams,
  validateWeightingParams,
} from "./api"
import type { PublishableTable, WeightingParamsPayload } from "./types"

export function useIdPesoConfig(pais: string) {
  return useQuery({
    queryKey: ["weighting-params", "idpeso-config", pais],
    queryFn: () => getIdPesoConfig(pais),
    staleTime: 30_000,
  })
}

export function useWeightingVariables(pais: string) {
  return useQuery({
    queryKey: ["weighting-params", "variables", pais],
    queryFn: () => getWeightingVariables(pais),
    staleTime: 30_000,
  })
}

export function useUniverso(pais: string) {
  return useQuery({
    queryKey: ["weighting-params", "universo", pais],
    queryFn: () => getUniverso(pais),
    staleTime: 30_000,
  })
}

export function usePublishWeightingParams(pais: string, tabla: PublishableTable) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: WeightingParamsPayload) => publishWeightingParams(pais, tabla, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["weighting-params", tabla, pais] }),
  })
}

/** Server-side validate. Exposed as a hook so the review dialog can call the
 *  real `/validate` endpoint and surface its structured errors inline. */
export function useValidateWeightingParams(pais: string, tabla: string) {
  return useMutation({
    mutationFn: (payload: WeightingParamsPayload) => validateWeightingParams(pais, tabla, payload),
  })
}

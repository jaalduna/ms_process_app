// JAA-547 — react-query hooks for the eligibility-params editor.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getParamsTable, publishParams, putParamsTable } from "./api"
import type { ParamRow } from "./types"

export function useParamsTable(table: string, country: string) {
  return useQuery({
    queryKey: ["eleg-params", table, country],
    queryFn: () => getParamsTable(table, country),
    staleTime: 30_000,
  })
}

export function useSaveParams(table: string, country: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rows: ParamRow[]) => putParamsTable(table, country, rows),
    onSuccess: (data) => qc.setQueryData(["eleg-params", table, country], data),
  })
}

export function usePublishParams(table: string, country: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rows: ParamRow[]) => publishParams(table, country, rows),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eleg-params", table, country] }),
  })
}

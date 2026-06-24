import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  getFormato4Runs,
  getFormato4Run,
  createFormato4Run,
  executeFormato4,
  cancelFormato4,
} from "@/lib/api"
import { FORMATO4_POLL_STATUSES } from "../types"
import type { Formato4RunCreate, Formato4Run } from "../types"

export function useFormato4Runs(country?: string, period?: number) {
  return useQuery({
    queryKey: ["formato4-runs", country, period],
    queryFn: () => getFormato4Runs({ country, period }),
    staleTime: 30_000,
    select: (data) => data.items,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      const hasActive = data.items.some(
        (run) => FORMATO4_POLL_STATUSES.includes(run.status),
      )
      return hasActive ? 3000 : false
    },
  })
}

export function useFormato4Run(runId: string | null) {
  return useQuery({
    queryKey: ["formato4-run", runId],
    queryFn: () => getFormato4Run(runId!),
    enabled: !!runId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && FORMATO4_POLL_STATUSES.includes(status) ? 3000 : false
    },
  })
}

export function useCreateFormato4Run() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Formato4RunCreate) => createFormato4Run(data),
    onSuccess: (run) => {
      queryClient.invalidateQueries({
        queryKey: ["formato4-runs", run.country],
      })
    },
  })
}

export function useExecuteFormato4() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => executeFormato4(runId),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["formato4-runs", run.country] })
      queryClient.invalidateQueries({ queryKey: ["formato4-run", run.run_id] })
    },
  })
}

export function useCancelFormato4() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => cancelFormato4(runId),
    onSuccess: (run: Formato4Run) => {
      queryClient.invalidateQueries({ queryKey: ["formato4-runs", run.country] })
      queryClient.invalidateQueries({ queryKey: ["formato4-run", run.run_id] })
    },
  })
}

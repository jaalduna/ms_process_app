import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  getMtrRuns,
  getMtrRun,
  createMtrRun,
  executeMtr,
  cancelMtr,
} from "@/lib/api"
import { MTR_POLL_STATUSES } from "../types"
import type { MtrRunCreate, MtrRun } from "../types"

export function useMtrRuns(country?: string, period?: number) {
  return useQuery({
    queryKey: ["mtr-runs", country, period],
    queryFn: () => getMtrRuns({ country, period }),
    staleTime: 30_000,
    select: (data) => data.items,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      const hasActive = data.items.some(
        (run) => MTR_POLL_STATUSES.includes(run.status),
      )
      return hasActive ? 3000 : false
    },
  })
}

export function useMtrRun(runId: string | null) {
  return useQuery({
    queryKey: ["mtr-run", runId],
    queryFn: () => getMtrRun(runId!),
    enabled: !!runId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && MTR_POLL_STATUSES.includes(status) ? 3000 : false
    },
  })
}

export function useCreateMtrRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: MtrRunCreate) => createMtrRun(data),
    onSuccess: (run) => {
      queryClient.invalidateQueries({
        queryKey: ["mtr-runs", run.country],
      })
    },
  })
}

export function useExecuteMtr() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => executeMtr(runId),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["mtr-runs", run.country] })
      queryClient.invalidateQueries({ queryKey: ["mtr-run", run.run_id] })
    },
  })
}

export function useCancelMtr() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => cancelMtr(runId),
    onSuccess: (run: MtrRun) => {
      queryClient.invalidateQueries({ queryKey: ["mtr-runs", run.country] })
      queryClient.invalidateQueries({ queryKey: ["mtr-run", run.run_id] })
    },
  })
}

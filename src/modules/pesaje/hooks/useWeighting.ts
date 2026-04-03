import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  getWeightingRuns,
  getWeightingRun,
  createWeightingRun,
  executeWeighting,
  cancelWeighting,
} from "@/lib/api"
import { WEIGHTING_ACTIVE_STATUSES } from "../types"
import type { WeightingRunCreate, WeightingRun } from "../types"

export function useWeightingRuns(country?: string, period?: number) {
  return useQuery({
    queryKey: ["weighting-runs", country, period],
    queryFn: () => getWeightingRuns({ country, period }),
    staleTime: 30_000,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      const hasActive = data.some(
        (run) => run.status === "pending" || WEIGHTING_ACTIVE_STATUSES.includes(run.status),
      )
      return hasActive ? 3000 : false
    },
  })
}

export function useWeightingRun(runId: string | null) {
  return useQuery({
    queryKey: ["weighting-run", runId],
    queryFn: () => getWeightingRun(runId!),
    enabled: !!runId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && WEIGHTING_ACTIVE_STATUSES.includes(status) ? 2000 : false
    },
  })
}

export function useCreateWeightingRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: WeightingRunCreate) => createWeightingRun(data),
    onSuccess: (run) => {
      queryClient.invalidateQueries({
        queryKey: ["weighting-runs", run.country],
      })
    },
  })
}

export function useExecuteWeighting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => executeWeighting(runId),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["weighting-runs", run.country] })
      queryClient.invalidateQueries({ queryKey: ["weighting-run", run.run_id] })
    },
  })
}

export function useCancelWeighting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => cancelWeighting(runId),
    onSuccess: (run: WeightingRun) => {
      queryClient.invalidateQueries({ queryKey: ["weighting-runs", run.country] })
      queryClient.invalidateQueries({ queryKey: ["weighting-run", run.run_id] })
    },
  })
}

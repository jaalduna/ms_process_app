import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  getPricesRuns,
  getPricesRun,
  createPricesRun,
  executePrices,
  approvePrices,
  cancelPrices,
} from "@/lib/api"
import { ACTIVE_PRICES_STATUSES } from "../types"
import type { PricesRunCreate } from "../types"

export function usePricesRuns(country?: string, period?: number) {
  return useQuery({
    queryKey: ["prices-runs", country, period],
    queryFn: () => getPricesRuns({ country, period }),
    staleTime: 30_000,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      const hasActive = data.items.some(
        (run) => run.status === "pending" || ACTIVE_PRICES_STATUSES.includes(run.status),
      )
      return hasActive ? 3000 : false
    },
  })
}

export function usePricesRun(runId: string | null) {
  return useQuery({
    queryKey: ["prices-run", runId],
    queryFn: () => getPricesRun(runId!),
    enabled: !!runId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (!status) return false
      if (status === "running" || status === "pending") return 3000
      return false
    },
  })
}

export function useCreatePricesRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: PricesRunCreate) => createPricesRun(data),
    onSuccess: (run) => {
      queryClient.invalidateQueries({
        queryKey: ["prices-runs", run.country],
      })
    },
  })
}

export function useExecutePrices() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => executePrices(runId),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["prices-runs", run.country] })
      queryClient.invalidateQueries({ queryKey: ["prices-run", run.run_id] })
    },
  })
}

export function useApprovePrices() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => approvePrices(runId),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["prices-runs", run.country] })
      queryClient.invalidateQueries({ queryKey: ["prices-run", run.run_id] })
    },
  })
}

export function useCancelPrices() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => cancelPrices(runId),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["prices-runs", run.country] })
      queryClient.invalidateQueries({ queryKey: ["prices-run", run.run_id] })
    },
  })
}

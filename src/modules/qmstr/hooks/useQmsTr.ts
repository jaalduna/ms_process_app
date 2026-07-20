import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getQmsTrRuns, getQmsTrRun, createQmsTrRun, executeQmsTrRun } from "@/lib/api"
import { QMSTR_POLL_STATUSES } from "../types"
import type { QmsTrRunCreate } from "../types"

export function useQmsTrRuns(country?: string, anoBase?: number) {
  return useQuery({
    queryKey: ["qmstr-runs", country, anoBase],
    queryFn: () => getQmsTrRuns({ country, ano_base: anoBase }),
    staleTime: 30_000,
    select: (data) => data.items,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      const hasActive = data.items.some((run) => QMSTR_POLL_STATUSES.includes(run.status))
      return hasActive ? 3000 : false
    },
  })
}

/** Same query as useQmsTrRuns but for the history modal (no country/ano_base
 * pinning beyond country, larger page size). */
export function useQmsTrHistory(country: string, enabled: boolean) {
  return useQuery({
    queryKey: ["qmstr-history", country],
    queryFn: () => getQmsTrRuns({ country, limit: 50 }),
    enabled,
    staleTime: 30_000,
  })
}

export function useQmsTrRun(jobId: string | null) {
  return useQuery({
    queryKey: ["qmstr-run", jobId],
    queryFn: () => getQmsTrRun(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && QMSTR_POLL_STATUSES.includes(status) ? 3000 : false
    },
  })
}

/** Creates a QMS-TR run in "pending" status. Does NOT start it — callers
 * must chain useExecuteQmsTrRun().mutate(run.run_id) on success (same
 * create-pending -> execute-triggers model as calibración/mtr; JAA-992's
 * 2-Databricks-job orchestration lives entirely server-side behind
 * execute + polling). */
export function useCreateQmsTrRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: QmsTrRunCreate) => createQmsTrRun(data),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["qmstr-runs", run.country] })
      queryClient.invalidateQueries({ queryKey: ["qmstr-history", run.country] })
    },
  })
}

/** Triggers a previously-created (pending) run. See useCreateQmsTrRun. */
export function useExecuteQmsTrRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => executeQmsTrRun(runId),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["qmstr-runs", run.country] })
      queryClient.invalidateQueries({ queryKey: ["qmstr-history", run.country] })
      queryClient.invalidateQueries({ queryKey: ["qmstr-run", run.job_id] })
    },
  })
}

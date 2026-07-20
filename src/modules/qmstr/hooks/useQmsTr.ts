import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getQmsTrRuns, getQmsTrRun, createQmsTrRun } from "@/lib/api"
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

/** Creates AND starts a QMS-TR job in one call (job_id model, unlike MTR's
 * separate create+execute steps). */
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

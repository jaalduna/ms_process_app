import { useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { triggerCalibration, getCalibrationRuns, cancelJob } from "@/lib/api"
import type { EventSummary, TriggerRequest } from "@/types/api"

const ACTIVE_STATUSES = ["pending", "running"]

export interface LaunchOverrides {
  skip_sync?: boolean
  /** Fuente de J: `"sync"` (default) o el tag de una versión registrada (JAA-1119). */
  j_source?: string
}

/**
 * Server-authoritative board of calibration runs for one period across ALL
 * countries (same JAA-648 principle as useCalibration, but list-level: one
 * query feeds every card instead of one query per country). Run summaries
 * already carry `steps`/`current_step`, so no per-run detail polling is
 * needed to render progress.
 */
export function useCalibrationBoard(period: string) {
  const queryClient = useQueryClient()

  const runs = useQuery({
    queryKey: ["calibration-board", period],
    queryFn: () => getCalibrationRuns({ period, limit: 100 }),
    select: (data) => data.items,
    refetchInterval: (query) => {
      const items = query.state.data?.items
      if (!items) return false
      return items.some((r) => ACTIVE_STATUSES.includes(r.status)) ? 2000 : false
    },
  })

  /** Newest run per country for this period (list is newest-first). */
  const latestByCountry = useMemo(() => {
    const map = new Map<string, EventSummary>()
    for (const r of runs.data ?? []) {
      if (!map.has(r.country)) map.set(r.country, r)
    }
    return map
  }, [runs.data])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["calibration-board", period] })
    // Keep the per-country page (useCalibration) in sync when both are open.
    queryClient.invalidateQueries({ queryKey: ["calibration-runs"] })
  }

  const trigger = useMutation({
    mutationFn: (body: TriggerRequest) => triggerCalibration(body),
    onSuccess: invalidate,
  })

  /** Launch one run per country; a failed trigger doesn't stop the others. */
  async function launch(countries: string[], overrides?: LaunchOverrides) {
    const settled = await Promise.allSettled(
      countries.map((country) =>
        trigger.mutateAsync({ country, stage: "calibracion", period, ...overrides }),
      ),
    )
    return settled.map((result, i) => ({ country: countries[i], result }))
  }

  const cancel = useMutation({
    mutationFn: (jobId: string) => cancelJob(jobId),
    onSuccess: invalidate,
  })

  return {
    runs: runs.data ?? [],
    isLoading: runs.isLoading,
    error: runs.error,
    latestByCountry,
    launch,
    launching: trigger.isPending,
    cancelRun: (jobId: string) => cancel.mutate(jobId),
    cancelling: cancel.isPending,
  }
}

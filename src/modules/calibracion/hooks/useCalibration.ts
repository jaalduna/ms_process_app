import { useCallback } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { triggerCalibration, getCalibrationRuns, getEvent, cancelJob } from "@/lib/api"
import type { EventDetail, TriggerRequest } from "@/types/api"
import type { AggregationOptions } from "../types"

export interface CalibrationOverrides {
  aggregations?: AggregationOptions
  row_limit?: number | null
  lookback_months?: number | null
  skip_sync?: boolean
  skip_copy?: boolean
  period?: string
  table_suffix?: string | null
  start_period?: string | null
  final_period?: string | null
  skip_merge?: boolean
  skip_simulation?: boolean
}

const ACTIVE_STATUSES = ["pending", "running"]

/**
 * Calibration run state is server-authoritative (JAA-648). The active run for a
 * country+period is derived from `GET /calibration/runs` (newest first), exactly
 * like `useMtr` derives `runs?.[0]` — NOT from `localStorage`. This makes the
 * "running" state survive a reload and be shared across browsers/users.
 */
export function useCalibration(country: string, stage: string, period?: string) {
  const queryClient = useQueryClient()

  const runs = useQuery({
    queryKey: ["calibration-runs", country, period],
    queryFn: () => getCalibrationRuns({ country, period }),
    select: (data) => data.items,
    refetchInterval: (query) => {
      const items = query.state.data?.items
      if (!items) return false
      return items.some((r) => ACTIVE_STATUSES.includes(r.status)) ? 3000 : false
    },
  })

  const activeJobId = runs.data?.[0]?.job_id ?? null

  const trigger = useMutation({
    mutationFn: (body: TriggerRequest) => triggerCalibration(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calibration-runs", country, period] })
    },
  })

  const job = useQuery({
    queryKey: ["calibration-job", activeJobId],
    queryFn: () => getEvent(activeJobId!),
    enabled: !!activeJobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === "completed" || status === "failed" || status === "cancelled") {
        return false
      }
      return 2000
    },
  })

  const startCalibration = useCallback((overrides?: CalibrationOverrides) => {
    return trigger.mutateAsync({
      country,
      stage,
      period: overrides?.period,
      aggregations: overrides?.aggregations,
      row_limit: overrides?.row_limit,
      lookback_months: overrides?.lookback_months,
      skip_sync: overrides?.skip_sync,
      skip_copy: overrides?.skip_copy,
      table_suffix: overrides?.table_suffix,
      start_period: overrides?.start_period,
      final_period: overrides?.final_period,
      skip_merge: overrides?.skip_merge,
      skip_simulation: overrides?.skip_simulation,
    })
  }, [trigger, country, stage])

  const cancel = useMutation({
    mutationFn: (jobId: string) => cancelJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calibration-runs", country, period] })
      queryClient.invalidateQueries({ queryKey: ["calibration-job", activeJobId] })
    },
  })

  const cancelCalibration = useCallback(() => {
    if (activeJobId) {
      cancel.mutate(activeJobId)
    }
  }, [cancel, activeJobId])

  return {
    activeJobId,
    job: job.data as EventDetail | undefined,
    isPolling: job.isFetching && !!activeJobId,
    isPending: trigger.isPending || (!!activeJobId && !job.data),
    isCancelling: cancel.isPending,
    triggerError: trigger.error,
    startCalibration,
    cancelCalibration,
  }
}

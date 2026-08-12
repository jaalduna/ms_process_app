import { useMemo } from "react"
import { useWeightingRuns, useCancelWeighting } from "./useWeighting"
import { WEIGHTING_ACTIVE_STATUSES } from "../types"
import type { WeightingRun } from "../types"

function periodStringToNumber(period: string): number {
  return parseInt(period, 10)
}

/**
 * Runs for one period across every country. Feeds the "needs attention" cards
 * on the Ejecutar tab (JAA feedback: no more per-country card grid — cards now
 * exist only for runs that are pending/running/failed, mirroring
 * wp-calibration-app's CalibrationRunPage). Completed/cancelled runs don't get
 * a card here; they live in the history table below.
 */
export function useWeightingBoard(period: string) {
  const { data, isLoading, error } = useWeightingRuns(undefined, periodStringToNumber(period))
  const cancel = useCancelWeighting()

  const runs = useMemo(() => data ?? [], [data])

  /** Newest run per country for this period (list is newest-first, per the API's ORDER BY created_at DESC). */
  const latestByCountry = useMemo(() => {
    const map = new Map<string, WeightingRun>()
    for (const r of runs) {
      if (!map.has(r.country)) map.set(r.country, r)
    }
    return map
  }, [runs])

  const needsAttention = useMemo(() => {
    const rank = (r: WeightingRun) => (r.status === "running" ? 0 : r.status === "pending" ? 1 : 2)
    return [...latestByCountry.values()]
      .filter((r) => r.status === "pending" || WEIGHTING_ACTIVE_STATUSES.includes(r.status) || r.status === "failed")
      .sort((a, b) => rank(a) - rank(b) || b.created_at.localeCompare(a.created_at))
  }, [latestByCountry])

  return {
    runs,
    isLoading,
    error,
    latestByCountry,
    needsAttention,
    cancelRun: (runId: string) => cancel.mutate(runId),
    cancelling: cancel.isPending,
  }
}

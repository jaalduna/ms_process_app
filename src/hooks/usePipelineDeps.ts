import { useQueries } from "@tanstack/react-query"
import {
  STAGE_DEPENDENCIES,
  STAGE_LABELS,
  STAGE_FETCHERS,
  type PipelineStage,
} from "@/lib/pipeline-deps"

export type DepStatusValue = "completed" | "not_run" | "unknown"

export interface DependencyStatus {
  stage: string
  label: string
  status: DepStatusValue
  completed_at?: string
}

/**
 * Fetch upstream dependency completion status for a given pipeline stage and country.
 *
 * Uses TanStack Query's `useQueries` so each upstream endpoint is cached and
 * deduplicated independently (staleTime: 60 s).
 */
export function usePipelineDeps(stage: PipelineStage, country: string) {
  const upstreamStages = STAGE_DEPENDENCIES[stage]

  const queries = useQueries({
    queries: upstreamStages.map((dep) => ({
      queryKey: [`last-${dep}`],
      queryFn: STAGE_FETCHERS[dep],
      staleTime: 60_000,
      retry: false,
    })),
  })

  const dependencies: DependencyStatus[] = upstreamStages.map((dep, i) => {
    const query = queries[i]

    if (query.isError) {
      return { stage: dep, label: STAGE_LABELS[dep], status: "unknown" as const }
    }

    if (query.isSuccess && query.data) {
      const entry = query.data.countries[country]
      if (entry) {
        return {
          stage: dep,
          label: STAGE_LABELS[dep],
          status: "completed" as const,
          completed_at: entry.completed_at,
        }
      }
      return { stage: dep, label: STAGE_LABELS[dep], status: "not_run" as const }
    }

    // Still loading or no data yet
    return { stage: dep, label: STAGE_LABELS[dep], status: "unknown" as const }
  })

  const loading = queries.some((q) => q.isLoading)
  const allMet = !loading && dependencies.every((d) => d.status === "completed")

  return { dependencies, allMet, loading }
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { closeProcess, getProcessStatus, openProcess } from "@/lib/api"
import type { ProcessStage, ProcessState } from "@/types/api"

export const PROCESS_STATUS_KEY = ["process-status"]

/** Poll process state so colleagues' open/close actions show up without reloading. */
export function useProcessStatus() {
  return useQuery({
    queryKey: PROCESS_STATUS_KEY,
    queryFn: getProcessStatus,
    staleTime: 10_000,
    refetchInterval: 30_000,
  })
}

/**
 * Derive a single stage+country process entry from the shared status query.
 * `isClosed` is explicit (status === "closed") so callers don't gate actions
 * while the status is still loading/unknown — only an explicitly closed process
 * blocks new runs.
 */
export function useProcessEntry(stage: ProcessStage, country: string) {
  const { data } = useProcessStatus()
  const entry = data?.countries[country]?.[stage] ?? null
  return {
    entry,
    isOpen: entry?.status === "open",
    isClosed: entry?.status === "closed",
  }
}

export function useSetProcessStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      stage,
      country,
      status,
    }: {
      stage: ProcessStage
      country: string
      status: ProcessState
    }) => (status === "open" ? openProcess(stage, country) : closeProcess(stage, country)),
    // Refetch on success and on error: a 409 means a colleague already
    // changed the state, so the local view is stale either way.
    onSettled: () => queryClient.invalidateQueries({ queryKey: PROCESS_STATUS_KEY }),
  })
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getProcessConfig, putProcessConfig } from "@/lib/api"
import { DEFAULT_MTR_PARAMS } from "../types"
import type { MtrParams } from "../types"

/** Query key for the shared MTR process config (JAA-644). */
export const MTR_CONFIG_KEY = ["process-config", "mtr"] as const

/**
 * Hydrate the shared MTR defaults from the backend (GET /config/processes/mtr).
 * Returns the raw response (`config` + `editable`); MtrPage merges `config`
 * over DEFAULT_MTR_PARAMS so missing keys fall back to the built-in defaults.
 */
export function useMtrConfig() {
  return useQuery({
    queryKey: MTR_CONFIG_KEY,
    queryFn: () => getProcessConfig("mtr"),
    staleTime: 30_000,
  })
}

/**
 * Persist the shared MTR defaults (PUT /config/processes/mtr) and invalidate the
 * query so every session re-hydrates the new shared value.
 */
export function useSaveMtrConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: MtrParams) =>
      putProcessConfig("mtr", params as unknown as Record<string, unknown>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MTR_CONFIG_KEY })
    },
  })
}

/** Merge a partial backend config over the built-in defaults. */
export function mergeMtrParams(config: Record<string, unknown> | undefined): MtrParams {
  return { ...DEFAULT_MTR_PARAMS, ...(config ?? {}) } as MtrParams
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getProcessConfig, putProcessConfig } from "@/lib/api"
import { DEFAULT_PRICES_CONFIG } from "../types"
import type { PricesConfig } from "../types"

/** Query key for the shared prices process config (JAA-646). */
export const PRICES_CONFIG_KEY = ["process-config", "prices"] as const

/**
 * Hydrate the shared prices defaults from the backend
 * (GET /config/processes/prices). Returns the raw response (`config` +
 * `editable`); PreciosPage merges `config` over DEFAULT_PRICES_CONFIG so missing
 * keys fall back to the built-in (dummy) defaults.
 */
export function usePricesConfig() {
  return useQuery({
    queryKey: PRICES_CONFIG_KEY,
    queryFn: () => getProcessConfig("prices"),
    staleTime: 30_000,
  })
}

/**
 * Persist the shared prices defaults (PUT /config/processes/prices) and
 * invalidate the query so every session re-hydrates the new shared value.
 */
export function useSavePricesConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: PricesConfig) =>
      putProcessConfig("prices", config as unknown as Record<string, unknown>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRICES_CONFIG_KEY })
    },
  })
}

/**
 * Merge a partial backend config over the built-in (dummy) defaults so a key the
 * backend hasn't set yet falls back to its default instead of becoming undefined.
 */
export function mergePricesConfig(
  config: Record<string, unknown> | undefined,
): PricesConfig {
  const c = (config ?? {}) as Partial<PricesConfig>
  return {
    placeholder_param_1: c.placeholder_param_1 ?? DEFAULT_PRICES_CONFIG.placeholder_param_1,
    placeholder_param_2: c.placeholder_param_2 ?? DEFAULT_PRICES_CONFIG.placeholder_param_2,
    notes: c.notes ?? DEFAULT_PRICES_CONFIG.notes,
  }
}

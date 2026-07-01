import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getProcessConfig, putProcessConfig } from "@/lib/api"
import { DEFAULT_CALIBRATION_CONFIG } from "../types"
import type { CalibrationConfig } from "../types"

/** Query key for the shared calibration process config (JAA-645). */
export const CALIBRATION_CONFIG_KEY = ["process-config", "calibration"] as const

/**
 * Hydrate the shared calibration defaults from the backend
 * (GET /config/processes/calibration). Returns the raw response (`config` +
 * `editable`); CalibrationPage merges `config` over DEFAULT_CALIBRATION_CONFIG so
 * missing keys fall back to the built-in defaults.
 */
export function useCalibrationConfig() {
  return useQuery({
    queryKey: CALIBRATION_CONFIG_KEY,
    queryFn: () => getProcessConfig("calibration"),
    staleTime: 30_000,
  })
}

/**
 * Persist the shared calibration defaults (PUT /config/processes/calibration)
 * and invalidate the query so every session re-hydrates the new shared value.
 */
export function useSaveCalibrationConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: CalibrationConfig) =>
      putProcessConfig("calibration", config as unknown as Record<string, unknown>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CALIBRATION_CONFIG_KEY })
    },
  })
}

/**
 * Merge a partial backend config over the built-in defaults. `aggregations` is a
 * nested object so it is merged key-by-key (a shallow spread would otherwise
 * drop a missing nested flag).
 */
export function mergeCalibrationConfig(
  config: Record<string, unknown> | undefined,
): CalibrationConfig {
  const c = (config ?? {}) as Partial<CalibrationConfig>
  return {
    aggregations: {
      ...DEFAULT_CALIBRATION_CONFIG.aggregations,
      ...(c.aggregations ?? {}),
    },
    lookback_months: c.lookback_months ?? DEFAULT_CALIBRATION_CONFIG.lookback_months,
  }
}
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getProcessConfig, putProcessConfig } from "@/lib/api"
import { DEFAULT_CALIBRATION_CONFIG, DEFAULT_GROUP_BY } from "../types"
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

// -- Per-country group_by (JAA-667) -----------------------------------------
// Persisted as a shared config row under a per-country *scope* of the
// `process_config` table (process="calibration", scope=<country code>). The
// backend already keys rows by (process, scope), so this needs no backend change.

/** Query key for a country's persisted calibration group_by (scope=country). */
export const calibrationGroupByKey = (country: string) =>
  ["process-config", "calibration", "group_by", country] as const

/**
 * Resolve the effective group_by for a country: the persisted shared value
 * (scope=country) when set to a non-empty string, else the built-in
 * `DEFAULT_GROUP_BY`, else null. Mirrors `mergeCalibrationConfig`'s fall-back
 * contract — the backend may have no row yet (`config = {}`).
 */
export function resolveGroupBy(
  config: Record<string, unknown> | undefined,
  country: string,
): string | null {
  const persisted = config?.group_by
  if (typeof persisted === "string" && persisted.trim() !== "") return persisted
  return DEFAULT_GROUP_BY[country] ?? null
}

/**
 * Hydrate a country's shared group_by (GET /config/processes/calibration?scope=country).
 * Returns the raw response (`config` + `editable`); callers resolve the effective
 * value via `resolveGroupBy`.
 */
export function useCountryGroupBy(country: string) {
  return useQuery({
    queryKey: calibrationGroupByKey(country),
    queryFn: () => getProcessConfig("calibration", country),
    staleTime: 30_000,
  })
}

/**
 * Persist a country's shared group_by (PUT ...?scope=country) and invalidate the
 * per-country query so every session re-hydrates the new shared value.
 */
export function useSaveCountryGroupBy(country: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (groupBy: string) =>
      putProcessConfig("calibration", { group_by: groupBy }, country),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calibrationGroupByKey(country) })
    },
  })
}

import { useQuery } from "@tanstack/react-query"
import { getLastCalibration } from "@/lib/api"

export function useLastCalibration() {
  return useQuery({
    queryKey: ["last-calibration", "v2"],
    queryFn: async () => {
      const res = await getLastCalibration()
      // Tolerate either {countries:{...}} or an already-unwrapped map.
      return (res?.countries ?? res ?? {}) as Record<string, { completed_at?: string }>
    },
    staleTime: 60 * 1000,
  })
}

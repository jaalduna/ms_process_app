import { useQuery } from "@tanstack/react-query"
import { getFormato4Runs } from "@/lib/api"

/**
 * Prior formato4 runs for a country, for the history modal (MTR-50). Clone of
 * `useMtrHistory` (MTR) — only enabled while the modal is open, capped at the
 * 50 most recent runs.
 */
export function useFormato4History(country: string, enabled: boolean) {
  return useQuery({
    queryKey: ["formato4-history", country],
    queryFn: () => getFormato4Runs({ country, limit: 50 }),
    enabled,
    staleTime: 30_000,
  })
}

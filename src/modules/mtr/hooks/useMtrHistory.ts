import { useQuery } from "@tanstack/react-query"
import { getMtrRuns } from "@/lib/api"

export function useMtrHistory(country: string, enabled: boolean) {
  return useQuery({
    queryKey: ["mtr-history", country],
    queryFn: () => getMtrRuns({ country, limit: 50 }),
    enabled,
    staleTime: 30_000,
  })
}

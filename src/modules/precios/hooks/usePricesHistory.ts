import { useQuery } from "@tanstack/react-query"
import { getPricesRuns } from "@/lib/api"

export function usePricesHistory(country: string, enabled: boolean) {
  return useQuery({
    queryKey: ["prices-history", country],
    queryFn: () => getPricesRuns({ country, limit: 20 }),
    enabled,
    staleTime: 30_000,
  })
}

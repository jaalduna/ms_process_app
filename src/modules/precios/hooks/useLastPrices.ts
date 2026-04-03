import { useQuery } from "@tanstack/react-query"
import { getLastPrices } from "@/lib/api"

export function useLastPrices() {
  return useQuery({
    queryKey: ["last-prices"],
    queryFn: async () => {
      const { countries } = await getLastPrices()
      return countries
    },
    staleTime: 60_000,
  })
}

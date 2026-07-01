import { useQuery } from "@tanstack/react-query"
import { getLastFormato4 } from "@/lib/api"

export function useLastFormato4() {
  return useQuery({
    queryKey: ["last-formato4"],
    queryFn: async () => {
      const { countries } = await getLastFormato4()
      return countries
    },
    staleTime: 60 * 1000,
  })
}

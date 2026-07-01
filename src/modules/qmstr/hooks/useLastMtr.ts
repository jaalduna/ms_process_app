import { useQuery } from "@tanstack/react-query"
import { getLastMtr } from "@/lib/api"

export function useLastMtr() {
  return useQuery({
    queryKey: ["last-mtr"],
    queryFn: async () => {
      const { countries } = await getLastMtr()
      return countries
    },
    staleTime: 60 * 1000,
  })
}

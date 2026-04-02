import { useQuery } from "@tanstack/react-query"
import { getLastWeighting } from "@/lib/api"

export function useLastWeighting() {
  return useQuery({
    queryKey: ["last-weighting"],
    queryFn: async () => {
      const { countries } = await getLastWeighting()
      return countries
    },
    staleTime: 60 * 1000,
  })
}

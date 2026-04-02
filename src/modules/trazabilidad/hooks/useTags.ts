import { useQuery } from "@tanstack/react-query"
import { getTags } from "@/lib/api"
import type { TagFilters } from "../types"

export function useTags(filters: TagFilters, page: number = 0) {
  const limit = 50
  const offset = page * limit
  return useQuery({
    queryKey: ["traceability-tags", filters, page],
    queryFn: () => getTags({ ...filters, limit, offset }),
    staleTime: 30_000,
  })
}

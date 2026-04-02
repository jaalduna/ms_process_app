import { useQuery } from "@tanstack/react-query"
import { getTagDetail } from "@/lib/api"

export function useTagDetail(tagId: string | null) {
  return useQuery({
    queryKey: ["traceability-tag", tagId],
    queryFn: () => getTagDetail(tagId!),
    enabled: !!tagId,
  })
}

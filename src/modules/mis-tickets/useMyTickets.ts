import { useQuery } from "@tanstack/react-query"
import { getMyFeedback } from "@/lib/api"

export function useMyTickets() {
  return useQuery({
    queryKey: ["feedback", "mine"],
    queryFn: getMyFeedback,
    staleTime: 5 * 60 * 1000,
    select: (data) => data.tickets,
  })
}

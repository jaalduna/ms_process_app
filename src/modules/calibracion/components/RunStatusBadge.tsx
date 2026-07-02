import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { JobStatus } from "@/types/api"

interface RunStatusBadgeProps {
  status: JobStatus | undefined
}

/**
 * Reusable status badge for the same slot Completed/Failed/Cancelled render
 * in today, extended with an animated "Ejecutándose" state for
 * running/pending (JAA-776). Visual parity preserved for the existing states.
 */
export function RunStatusBadge({ status }: RunStatusBadgeProps) {
  if (status === "running" || status === "pending") {
    return (
      <Badge variant="outline" className="gap-1.5 text-info border-info/30 bg-info/10">
        <Loader2 className="h-3 w-3 animate-spin" />
        Ejecutándose
      </Badge>
    )
  }
  if (status === "completed") {
    return (
      <Badge variant="default" className="bg-success">
        Completed
      </Badge>
    )
  }
  if (status === "failed") {
    return <Badge variant="destructive">Failed</Badge>
  }
  if (status === "cancelled") {
    return <Badge variant="secondary">Cancelled</Badge>
  }
  return null
}

import { CheckCircle2, XCircle, Loader2, HelpCircle } from "lucide-react"

interface DataAvailabilityBadgeProps {
  label: string
  /** `true` available, `false` missing, `null`/`undefined` unknown ("?"). */
  available: boolean | null | undefined
  loading?: boolean
}

export function DataAvailabilityBadge({ label, available, loading }: DataAvailabilityBadgeProps) {
  const unknown = available === null || available === undefined
  return (
    <div className="flex items-center gap-1.5 text-sm">
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : unknown ? (
        <HelpCircle className="h-5 w-5 text-muted-foreground" />
      ) : available ? (
        <CheckCircle2 className="h-5 w-5 text-success" />
      ) : (
        <XCircle className="h-5 w-5 text-destructive" />
      )}
      <span className={available ? "text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
    </div>
  )
}

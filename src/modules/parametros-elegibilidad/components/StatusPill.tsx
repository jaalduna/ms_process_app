import { Badge } from "@/components/ui/badge"
import { CheckCircle2, AlertTriangle } from "lucide-react"

export function StatusPill({ errors, dirty }: { errors: number; dirty: number }) {
  if (dirty === 0)
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground" data-testid="status-pill">
        <CheckCircle2 className="h-3 w-3" />
        Sin cambios
      </Badge>
    )
  if (errors > 0)
    return (
      <Badge variant="destructive" className="gap-1" data-testid="status-pill">
        <AlertTriangle className="h-3 w-3" />
        {errors} error{errors !== 1 && "es"} · {dirty} cambio{dirty !== 1 && "s"}
      </Badge>
    )
  return (
    <Badge variant="outline" className="gap-1 border-success/30 bg-success/15 text-success" data-testid="status-pill">
      <CheckCircle2 className="h-3 w-3" />
      {dirty} cambio{dirty !== 1 && "s"} · válido
    </Badge>
  )
}

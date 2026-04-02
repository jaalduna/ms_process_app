import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { WEIGHTING_STATUS_CONFIG } from "../types"
import type { WeightingRun } from "../types"

interface WeightingDetailModalProps {
  run: WeightingRun | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onRerun?: (params: Record<string, unknown>) => void
}

/** Placeholder — full implementation in JAA-246 */
export function WeightingDetailModal({ run, open, onOpenChange }: WeightingDetailModalProps) {
  if (!run) return null

  const statusConfig = WEIGHTING_STATUS_CONFIG[run.status]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Detalle Pesaje
            <Badge variant={statusConfig.variant} className={statusConfig.className}>
              {statusConfig.label}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Run: {run.run_id.slice(0, 8)} | Pais: {run.country} | Periodo: {run.period}
        </p>
      </DialogContent>
    </Dialog>
  )
}

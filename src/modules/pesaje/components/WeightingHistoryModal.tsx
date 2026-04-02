import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { COUNTRY_LABELS } from "./WeightingCountryCard"

interface WeightingHistoryModalProps {
  countryCode: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Placeholder — full implementation in JAA-246 */
export function WeightingHistoryModal({ countryCode, open, onOpenChange }: WeightingHistoryModalProps) {
  const countryLabel = COUNTRY_LABELS[countryCode] ?? countryCode

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Historial de Pesaje - {countryLabel}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Historial pendiente de implementacion completa.
        </p>
      </DialogContent>
    </Dialog>
  )
}

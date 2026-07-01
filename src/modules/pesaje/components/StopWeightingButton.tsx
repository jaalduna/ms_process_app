import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Square } from "lucide-react"

interface StopWeightingButtonProps {
  countryLabel: string
  period: string
  disabled: boolean
  onConfirm: () => void
}

/** "Detener" button + confirm dialog, shared between the card and list-row layouts (JAA-763). */
export function StopWeightingButton({ countryLabel, period, disabled, onConfirm }: StopWeightingButtonProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="destructive" disabled={disabled} onClick={(e) => e.stopPropagation()}>
          <Square className="mr-2 h-3.5 w-3.5" />
          Detener
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Detener ejecucion</AlertDialogTitle>
          <AlertDialogDescription>
            Detener el proceso para <strong>{countryLabel}</strong> periodo <strong>{period}</strong>?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Volver</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onConfirm}>
            Detener
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

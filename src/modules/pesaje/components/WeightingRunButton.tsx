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
import { Loader2, Play } from "lucide-react"

interface WeightingRunButtonProps {
  countryLabel: string
  period: string
  disabled: boolean
  isStarting: boolean
  onConfirm: () => void
}

/** Icon-only "Play" button + confirm dialog: launches the weighting pipeline
 * inline (row/card) with default params, without opening the detail modal (JAA-778). */
export function WeightingRunButton({ countryLabel, period, disabled, isStarting, onConfirm }: WeightingRunButtonProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          disabled={disabled}
          aria-label="Iniciar pesaje"
          title="Iniciar pesaje"
          onClick={(e) => e.stopPropagation()}
        >
          {isStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Iniciar pesaje</AlertDialogTitle>
          <AlertDialogDescription>
            Iniciar pipeline de pesaje para <strong>{countryLabel}</strong> periodo <strong>{period}</strong>?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Iniciar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

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
import { Loader2, Square } from "lucide-react"
import { toast } from "sonner"

interface StopCalibrationButtonProps {
  countryLabel: string
  isCancelling: boolean
  cancelCalibration: () => void
}

/** "Stop" button + confirm dialog, shared between the card and list-row layouts (JAA-763). */
export function StopCalibrationButton({ countryLabel, isCancelling, cancelCalibration }: StopCalibrationButtonProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="destructive" aria-label="Stop calibration" disabled={isCancelling}>
          {isCancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop Calibration</AlertDialogTitle>
          <AlertDialogDescription>
            Stop the running calibration for <strong>{countryLabel}</strong>? This will cancel all pending steps.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep Running</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              cancelCalibration()
              toast.info(`Calibration stopped for ${countryLabel}`)
            }}
          >
            Stop
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

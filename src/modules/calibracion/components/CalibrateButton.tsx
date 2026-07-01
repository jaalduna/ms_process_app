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
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { CalibrationConfig } from "../types"

interface CalibrateButtonProps {
  countryLabel: string
  period: string
  calibrationConfig: CalibrationConfig
  groupBy: string | null
  canTrigger: boolean
  isClosed: boolean
  isPending: boolean
  isRunning: boolean
  startCalibration: (params: {
    period: string
    aggregations: CalibrationConfig["aggregations"]
    lookback_months: number
    skip_sync: boolean
    table_suffix: string
    group_by: string | null
  }) => Promise<unknown>
  className?: string
}

/** "Calibrar" button + confirm dialog, shared between the card and list-row layouts (JAA-763). */
export function CalibrateButton({
  countryLabel,
  period,
  calibrationConfig,
  groupBy,
  canTrigger,
  isClosed,
  isPending,
  isRunning,
  startCalibration,
  className,
}: CalibrateButtonProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          disabled={!canTrigger}
          className={className}
          title={isClosed ? "Proceso cerrado" : !canTrigger ? "Data not available or calibration already running" : undefined}
        >
          {isPending || isRunning ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isPending ? "Starting..." : "Running..."}
            </>
          ) : (
            "Calibrar"
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Calibration</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-muted-foreground">
              <p>
                Start calibration for <strong>{countryLabel}</strong> period <strong>{period}</strong>?
              </p>
              {(calibrationConfig.aggregations.region || calibrationConfig.aggregations.nivel_2) && (
                <p className="mt-2">
                  Aggregations:{" "}
                  {[calibrationConfig.aggregations.region && "Region", calibrationConfig.aggregations.nivel_2 && "Canal"]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
              <p className="mt-2">
                Group by: <code className="text-xs bg-muted px-1 rounded">{groupBy || "default"}</code>
              </p>
              <p className="mt-2">Overrides: {calibrationConfig.lookback_months} months lookback</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              startCalibration({
                period,
                aggregations: calibrationConfig.aggregations,
                lookback_months: calibrationConfig.lookback_months,
                skip_sync: true,
                table_suffix: "_full",
                group_by: groupBy,
              })
                .then(() => {
                  toast.success(`Calibration started for ${countryLabel}`)
                })
                .catch((err: unknown) => {
                  const message = (err as { message?: string })?.message ?? "Unknown error"
                  toast.error(`Failed to start calibration for ${countryLabel}: ${message}`)
                })
            }}
          >
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

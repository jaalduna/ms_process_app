import { useState } from "react"
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
import { Switch } from "@/components/ui/switch"
import { Loader2, Play } from "lucide-react"
import { toast } from "sonner"
import type { CalibrationConfig } from "../types"

interface CalibrateButtonProps {
  countryLabel: string
  period: string
  calibrationConfig: CalibrationConfig
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
  }) => Promise<unknown>
  className?: string
}

/** "Calibrar" button + confirm dialog, shared between the card and list-row layouts (JAA-763). */
export function CalibrateButton({
  countryLabel,
  period,
  calibrationConfig,
  canTrigger,
  isClosed,
  isPending,
  isRunning,
  startCalibration,
  className,
}: CalibrateButtonProps) {
  // skip_sync defaults to false: by default the run executes the SQL→bronze sync
  // (check_sync→run_sync). Toggle on to skip it and rely on the daily mirror_sync.
  const [skipSync, setSkipSync] = useState(false)

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          disabled={!canTrigger}
          className={className}
          aria-label="Calibrar"
          title={
            isClosed
              ? "Proceso cerrado"
              : !canTrigger
                ? "Data not available or calibration already running"
                : isPending
                  ? "Starting..."
                  : "Calibrar"
          }
        >
          {isPending || isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
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
              <p className="mt-2">Overrides: {calibrationConfig.lookback_months} months lookback</p>
              <label
                className="mt-3 flex items-start gap-2 cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              >
                <Switch
                  checked={skipSync}
                  onCheckedChange={setSkipSync}
                  aria-label="Saltar sincronización"
                  className="mt-0.5"
                />
                <span className="text-xs">
                  Saltar sincronización (<code className="bg-muted px-1 rounded">skip_sync</code>)
                  <span className="block text-muted-foreground">
                    Por defecto se ejecuta la sync SQL→bronze. Actívalo solo si confías en el mirror_sync diario.
                  </span>
                </span>
              </label>
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
                skip_sync: skipSync,
                table_suffix: "_full",
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

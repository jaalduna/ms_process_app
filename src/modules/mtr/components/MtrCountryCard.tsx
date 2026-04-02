import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { MtrProgress } from "./MtrProgress"
import { MtrHistoryModal } from "./MtrHistoryModal"
import { useMtrRuns, useCreateMtrRun, useExecuteMtr, useCancelMtr } from "../hooks/useMtr"
import { MTR_ACTIVE_STATUSES, MTR_STATUS_CONFIG } from "../types"
import type { MtrParams } from "../types"

const COUNTRY_FLAGS: Record<string, string> = {
  argentina: "\u{1F1E6}\u{1F1F7}",
  bolivia: "\u{1F1E7}\u{1F1F4}",
  brasil: "\u{1F1E7}\u{1F1F7}",
  brazil: "\u{1F1E7}\u{1F1F7}",
  cam: "\u{1F30E}",
  chile: "\u{1F1E8}\u{1F1F1}",
  colombia: "\u{1F1E8}\u{1F1F4}",
  ecuador: "\u{1F1EA}\u{1F1E8}",
  mexico: "\u{1F1F2}\u{1F1FD}",
  peru: "\u{1F1F5}\u{1F1EA}",
}

const COUNTRY_LABELS: Record<string, string> = {
  argentina: "Argentina",
  bolivia: "Bolivia",
  brasil: "Brasil",
  brazil: "Brasil",
  cam: "CAM",
  chile: "Chile",
  colombia: "Colombia",
  ecuador: "Ecuador",
  mexico: "Mexico",
  peru: "Peru",
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function periodStringToNumber(period: string): number {
  return parseInt(period, 10)
}

interface MtrCountryCardProps {
  countryCode: string
  period: string
  mtrParams: MtrParams
  lastMtrDate: string | null
}

export function MtrCountryCard({
  countryCode,
  period,
  mtrParams,
  lastMtrDate,
}: MtrCountryCardProps) {
  const [showHistory, setShowHistory] = useState(false)

  const { data: runs, isLoading } = useMtrRuns(countryCode, periodStringToNumber(period))
  const createRun = useCreateMtrRun()
  const executeRun = useExecuteMtr()
  const cancelRun = useCancelMtr()

  const latestRun = runs?.[0] ?? null
  const countryLabel = COUNTRY_LABELS[countryCode] ?? countryCode
  const flag = COUNTRY_FLAGS[countryCode] ?? ""

  const isProcessing = latestRun ? MTR_ACTIVE_STATUSES.includes(latestRun.status) : false
  const isPending = latestRun?.status === "pending"
  const isCompleted = latestRun?.status === "completed"
  const isFailed = latestRun?.status === "failed"
  const canExecute = !isProcessing && !isPending && !createRun.isPending && !executeRun.isPending

  const statusConfig = latestRun ? MTR_STATUS_CONFIG[latestRun.status] : null

  const handleExecute = () => {
    createRun.mutate(
      {
        country: countryCode,
        period: periodStringToNumber(period),
        parameters: { ...mtrParams } as Record<string, unknown>,
      },
      {
        onSuccess: (run) => {
          executeRun.mutate(run.run_id, {
            onSuccess: () => toast.success(`MTR started for ${countryLabel}`),
            onError: () => toast.error(`Failed to execute MTR for ${countryLabel}`),
          })
        },
        onError: () => toast.error(`Failed to create MTR run for ${countryLabel}`),
      },
    )
  }

  const handleCancel = () => {
    if (!latestRun) return
    cancelRun.mutate(latestRun.run_id, {
      onSuccess: () => toast.info(`MTR stopped for ${countryLabel}`),
      onError: () => toast.error(`Failed to cancel MTR for ${countryLabel}`),
    })
  }

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      role="button"
      tabIndex={0}
      aria-label={`View MTR history for ${countryLabel}`}
      onClick={() => setShowHistory(true)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowHistory(true) } }}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {flag && <span className="mr-1.5">{flag}</span>}
            {countryLabel}
          </CardTitle>
          <Badge
            variant="outline"
            className="text-xs"
            title={lastMtrDate ? `Last MTR: ${lastMtrDate.replace("T", " ").slice(0, 16)}` : undefined}
          >
            {lastMtrDate ? formatRelativeTime(lastMtrDate) : "never"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Latest run status */}
        {isLoading && (
          <div className="h-5 w-24 animate-pulse rounded bg-muted" />
        )}
        {!isLoading && statusConfig && (
          <Badge variant={statusConfig.variant} className={statusConfig.className}>
            {statusConfig.label}
          </Badge>
        )}

        {/* Progress steps */}
        {latestRun?.steps && latestRun.steps.length > 0 && (isProcessing || isPending || isCompleted || isFailed) && (
          <MtrProgress steps={latestRun.steps} currentStep={latestRun.current_step} />
        )}

        {/* Error message */}
        {latestRun?.error_message && (
          <p className="text-xs text-destructive truncate" title={latestRun.error_message}>
            {latestRun.error_message}
          </p>
        )}

        {/* Actions */}
        <div onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-2">
            {/* Processing state */}
            {(isProcessing || isPending) && (
              <>
                <Button size="sm" disabled className="flex-1">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isPending ? "Starting..." : "Running..."}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive" disabled={cancelRun.isPending}>
                      <Square className="mr-2 h-3.5 w-3.5" />
                      Stop
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Stop MTR</AlertDialogTitle>
                      <AlertDialogDescription>
                        Stop the running MTR pipeline for <strong>{countryLabel}</strong> period <strong>{period}</strong>?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep Running</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={handleCancel}
                      >
                        Stop
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}

            {/* Trigger: when no active process */}
            {!isProcessing && !isPending && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" disabled={!canExecute} className="flex-1">
                    {(createRun.isPending || executeRun.isPending) ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Starting...
                      </>
                    ) : (
                      "Ejecutar"
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirm MTR</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="text-sm text-muted-foreground">
                        <p>
                          Start MTR pipeline for{" "}
                          <strong>{countryLabel}</strong> period{" "}
                          <strong>{period}</strong>?
                        </p>
                        <p className="mt-2 text-xs">
                          Threshold: {mtrParams.target_threshold}, Method: {mtrParams.imputation_method.replace(/_/g, " ")}, Min quality: {mtrParams.quality_min}
                        </p>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleExecute}>
                      Confirm
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

          </div>
        </div>
      </CardContent>

      <MtrHistoryModal
        country={countryCode}
        countryLabel={countryLabel}
        countryFlag={flag}
        open={showHistory}
        onClose={() => setShowHistory(false)}
      />
    </Card>
  )
}

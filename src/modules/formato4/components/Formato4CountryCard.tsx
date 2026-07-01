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
import { Download, Eye, History, Loader2, Square } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { ProcessStatusBadge } from "@/components/ProcessStatusBadge"
import { useProcessEntry } from "@/hooks/useProcessStatus"
import { Formato4Progress } from "./Formato4Progress"
import { Formato4DetailModal } from "./Formato4DetailModal"
import { Formato4HistoryModal } from "./Formato4HistoryModal"
import {
  useFormato4Runs,
  useCreateFormato4Run,
  useExecuteFormato4,
  useCancelFormato4,
} from "../hooks/useFormato4"
import { downloadFormato4 } from "@/lib/api"
import { FORMATO4_ACTIVE_STATUSES, FORMATO4_STATUS_CONFIG } from "../types"
import { COUNTRY_FLAGS, COUNTRY_LABELS } from "@/lib/countries"
import { formatRelativeTime } from "@/lib/utils"

function periodStringToNumber(period: string): number {
  return parseInt(period, 10)
}

interface Formato4CountryCardProps {
  countryCode: string
  period: string
  lastFormato4Date: string | null
}

/**
 * Country card for the Formato 4 module. Clone of `MtrCountryCard` (MTR-30)
 * driving the formato4 run lifecycle (create → execute → poll → cancel) off
 * `latestRun.status`. Formato 4 has no params, so there is no config dialog and
 * `create` sends no parameters. The zip download (MTR-32), detail Eye
 * (MTR-33) and history modal (MTR-50) are all wired here.
 */
export function Formato4CountryCard({
  countryCode,
  period,
  lastFormato4Date,
}: Formato4CountryCardProps) {
  const { data: runs, isLoading } = useFormato4Runs(countryCode, periodStringToNumber(period))
  const createRun = useCreateFormato4Run()
  const executeRun = useExecuteFormato4()
  const cancelRun = useCancelFormato4()

  const latestRun = runs?.[0] ?? null
  const countryLabel = COUNTRY_LABELS[countryCode] ?? countryCode
  const flag = COUNTRY_FLAGS[countryCode] ?? ""

  const isProcessing = latestRun ? FORMATO4_ACTIVE_STATUSES.includes(latestRun.status) : false
  const isPending = latestRun?.status === "pending"
  const isCompleted = latestRun?.status === "completed"
  const isFailed = latestRun?.status === "failed"
  const { isClosed } = useProcessEntry("formato4", countryCode)
  const canExecute =
    !isProcessing && !isPending && !createRun.isPending && !executeRun.isPending && !isClosed

  const statusConfig = latestRun ? FORMATO4_STATUS_CONFIG[latestRun.status] : null

  const handleExecute = () => {
    createRun.mutate(
      {
        country: countryCode,
        period: periodStringToNumber(period),
      },
      {
        onSuccess: (run) => {
          executeRun.mutate(run.run_id, {
            onSuccess: () => toast.success(`Formato 4 started for ${countryLabel}`),
            onError: () => toast.error(`Failed to execute Formato 4 for ${countryLabel}`),
          })
        },
        onError: () => toast.error(`Failed to create Formato 4 run for ${countryLabel}`),
      },
    )
  }

  const handleCancel = () => {
    if (!latestRun) return
    cancelRun.mutate(latestRun.run_id, {
      onSuccess: () => toast.info(`Formato 4 stopped for ${countryLabel}`),
      onError: () => toast.error(`Failed to cancel Formato 4 for ${countryLabel}`),
    })
  }

  // Detail modal (MTR-33): opened from the Eye button on any run that has
  // started (status !== "pending"); reads live updates via useFormato4Run.
  const [detailRunId, setDetailRunId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // History modal (MTR-50): lists prior runs for this country with a
  // per-completed-run re-download. Shown once at least one run exists.
  const [historyOpen, setHistoryOpen] = useState(false)

  const [isDownloading, setIsDownloading] = useState(false)
  const handleDownload = async () => {
    if (!latestRun) return
    setIsDownloading(true)
    try {
      // Server-generated zip by runId (MTR-32) — mirrors the weighting
      // download, NOT the client-side MTR CSV builder.
      await downloadFormato4(latestRun.run_id, countryCode)
      toast.success(`Formato 4 zip downloaded for ${countryLabel}`)
    } catch {
      toast.error(`Failed to download Formato 4 zip for ${countryLabel}`)
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {flag && <span className="mr-1.5">{flag}</span>}
            {countryLabel}
          </CardTitle>
          <Badge
            variant="outline"
            className="text-xs"
            title={
              lastFormato4Date
                ? `Last Formato 4: ${lastFormato4Date.replace("T", " ").slice(0, 16)}`
                : undefined
            }
          >
            {lastFormato4Date ? formatRelativeTime(lastFormato4Date) : "never"}
          </Badge>
        </div>
        <div className="mt-2">
          <ProcessStatusBadge stage="formato4" country={countryCode} countryLabel={countryLabel} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Latest run status */}
        {isLoading && <div className="h-5 w-24 animate-pulse rounded bg-muted" />}
        {!isLoading && statusConfig && (
          <Badge variant={statusConfig.variant} className={statusConfig.className}>
            {statusConfig.label}
          </Badge>
        )}

        {/* Progress steps */}
        {latestRun?.steps &&
          latestRun.steps.length > 0 &&
          (isProcessing || isPending || isCompleted || isFailed) && (
            <Formato4Progress
              steps={latestRun.steps}
              currentStep={latestRun.current_step}
              error={latestRun.error_message}
            />
          )}

        {/* Error message */}
        {latestRun?.error_message && (
          <p className="text-xs text-destructive truncate" title={latestRun.error_message}>
            {latestRun.error_message}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
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
                    <AlertDialogTitle>Stop Formato 4</AlertDialogTitle>
                    <AlertDialogDescription>
                      Stop the running Formato 4 pipeline for <strong>{countryLabel}</strong> period{" "}
                      <strong>{period}</strong>?
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
                <Button
                  size="sm"
                  disabled={!canExecute}
                  className="flex-1"
                  title={isClosed ? "Proceso cerrado" : undefined}
                >
                  {createRun.isPending || executeRun.isPending ? (
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
                  <AlertDialogTitle>Confirm Formato 4</AlertDialogTitle>
                  <AlertDialogDescription>
                    Start Formato 4 pipeline for <strong>{countryLabel}</strong> period{" "}
                    <strong>{period}</strong>?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleExecute}>Confirm</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Download server-generated zip (only once completed) */}
          {isCompleted && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDownload}
              disabled={isDownloading}
              title={`Descargar Formato 4 (${countryLabel})`}
            >
              {isDownloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Descargar
            </Button>
          )}

          {/* View detail (MTR-33): opens the Formato4DetailModal for the run */}
          {latestRun && latestRun.status !== "pending" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDetailRunId(latestRun.run_id)
                setDetailOpen(true)
              }}
              title={`Ver detalle Formato 4 (${countryLabel})`}
              aria-label="Ver detalle"
            >
              <Eye className="h-4 w-4" />
            </Button>
          )}

          {/* History (MTR-50): opens the Formato4HistoryModal for the country */}
          {latestRun && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setHistoryOpen(true)}
              title={`Historial Formato 4 (${countryLabel})`}
              aria-label="Ver historial"
            >
              <History className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>

      <Formato4DetailModal
        runId={detailRunId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />

      <Formato4HistoryModal
        country={countryCode}
        countryLabel={countryLabel}
        countryFlag={flag}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </Card>
  )
}

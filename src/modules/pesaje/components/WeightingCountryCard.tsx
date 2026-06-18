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
import { History, Loader2, Square } from "lucide-react"
import { toast } from "sonner"
import { ProcessStatusBadge } from "@/components/ProcessStatusBadge"
import { useProcessEntry } from "@/hooks/useProcessStatus"
import { useWeightingRuns, useCreateWeightingRun, useExecuteWeighting, useCancelWeighting } from "../hooks/useWeighting"
import { WeightingProgress } from "./WeightingProgress"
import { WeightingDetailModal } from "./WeightingDetailModal"
import { WeightingHistoryModal } from "./WeightingHistoryModal"
import { WEIGHTING_ACTIVE_STATUSES, WEIGHTING_STATUS_CONFIG } from "../types"

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

// eslint-disable-next-line react-refresh/only-export-components -- intentional shadcn/context pattern: co-exports constant with component
export const COUNTRY_LABELS: Record<string, string> = {
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

interface WeightingCountryCardProps {
  countryCode: string
  period: string
  lastFinalizedDate: string | null
}

function periodStringToNumber(period: string): number {
  return parseInt(period, 10)
}

export function WeightingCountryCard({ countryCode, period, lastFinalizedDate }: WeightingCountryCardProps) {
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const { data: runs, isLoading } = useWeightingRuns(countryCode, periodStringToNumber(period))
  const createRun = useCreateWeightingRun()
  const executeRun = useExecuteWeighting()
  const cancelRun = useCancelWeighting()

  const latestRun = runs?.[0] ?? null
  const countryLabel = COUNTRY_LABELS[countryCode] ?? countryCode
  const flag = COUNTRY_FLAGS[countryCode] ?? ""

  const { isClosed } = useProcessEntry("pesaje", countryCode)
  const isProcessing = latestRun ? WEIGHTING_ACTIVE_STATUSES.includes(latestRun.status) : false
  const hasAnyRuns = runs != null && runs.length > 0
  const statusConfig = latestRun ? WEIGHTING_STATUS_CONFIG[latestRun.status] : null

  // Configure + run all happen inside the detail dialog now. The card just launches
  // whatever the dialog's editor produced; create then execute (the "iterate" loop).
  const handleRun = (params: Record<string, unknown>) => {
    createRun.mutate(
      { country: countryCode, period: periodStringToNumber(period), parameters: params },
      {
        onSuccess: (run) => {
          executeRun.mutate(run.run_id, {
            onSuccess: () => toast.success(`Pipeline iniciado para ${countryLabel}`),
            onError: () => toast.error(`Error al ejecutar pipeline para ${countryLabel}`),
          })
        },
        onError: () => toast.error(`Error al crear ejecucion para ${countryLabel}`),
      },
    )
  }

  const handleCancel = () => {
    if (!latestRun) return
    cancelRun.mutate(latestRun.run_id, {
      onSuccess: () => toast.info(`Ejecucion detenida para ${countryLabel}`),
      onError: () => toast.error(`Error al detener ejecucion para ${countryLabel}`),
    })
  }

  const openDetail = () => setDetailModalOpen(true)

  return (
    <>
      <Card
        role="button"
        tabIndex={0}
        aria-label={`Abrir detalle de Pesaje para ${countryLabel}`}
        onClick={openDetail}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            openDetail()
          }
        }}
        className="cursor-pointer transition-colors hover:border-ring/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {flag && <span className="mr-1.5">{flag}</span>}
              {countryLabel}
            </CardTitle>
            <Badge variant="outline" className="text-xs" title={lastFinalizedDate ? `Last: ${lastFinalizedDate.replace("T", " ").slice(0, 16)}` : undefined}>
              {lastFinalizedDate
                ? formatRelativeTime(lastFinalizedDate)
                : "never"}
            </Badge>
          </div>
          <div className="mt-2">
            <ProcessStatusBadge stage="pesaje" country={countryCode} countryLabel={countryLabel} />
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
          {latestRun?.steps && latestRun.steps.length > 0 && latestRun.status !== "pending" && (
            <WeightingProgress steps={latestRun.steps} currentStep={latestRun.current_step} />
          )}

          {/* Error message */}
          {latestRun?.error_message && (
            <p className="text-xs text-destructive truncate" title={latestRun.error_message}>
              {latestRun.error_message}
            </p>
          )}

          {/* Hint: no runs yet — the card opens the config+run dialog */}
          {!isLoading && !latestRun && !isClosed && (
            <p className="text-xs text-muted-foreground">
              Sin ejecuciones. Clic para configurar y ejecutar.
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {/* Processing: spinner + Detener (clicks must not bubble to the card open handler) */}
            {isProcessing && (
              <>
                <Button size="sm" disabled className="flex-1">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Procesando...
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive" disabled={cancelRun.isPending} onClick={(e) => e.stopPropagation()}>
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
                      <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleCancel}>
                        Detener
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}

            {/* History button */}
            {hasAnyRuns && (
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  setHistoryModalOpen(true)
                }}
                title="Historial"
              >
                <History className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <WeightingDetailModal
        run={latestRun}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        onRun={isClosed ? undefined : handleRun}
        countryCode={countryCode}
        period={period}
      />

      <WeightingHistoryModal
        countryCode={countryCode}
        open={historyModalOpen}
        onOpenChange={setHistoryModalOpen}
      />
    </>
  )
}

import { memo, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Badge } from "@/components/ui/badge"
import { Loader2, Eye, Square, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { cn, formatRelativeTime } from "@/lib/utils"
import { COUNTRY_FLAGS, COUNTRY_LABELS } from "@/lib/countries"
import { ProcessStatusBadge } from "@/components/ProcessStatusBadge"
import { useProcessEntry } from "@/hooks/useProcessStatus"
import { PricesProgress } from "./PricesProgress"
import { PricesDetailModal } from "./PricesDetailModal"
import { PricesHistoryModal } from "./PricesHistoryModal"
import { usePricesRuns, useCreatePricesRun, useExecutePrices, useCancelPrices } from "../hooks/usePrices"
import { PRICES_STATUS_CONFIG } from "../types"
import type { PricesRun } from "../types"
import type { CountryInfo } from "@/types/api"

interface PricesCountryCardProps {
  country: CountryInfo
  period: string
  lastValidationDate: string | null
}

export const PricesCountryCard = memo(function PricesCountryCard({ country, period, lastValidationDate }: PricesCountryCardProps) {
  const [showDetail, setShowDetail] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [selectedRun, setSelectedRun] = useState<PricesRun | null>(null)

  const { data: runsData } = usePricesRuns(country.code, Number(period))
  const createRun = useCreatePricesRun()
  const executeRun = useExecutePrices()
  const cancelRun = useCancelPrices()

  // Find the most recent active run for this country
  const runs = runsData?.items ?? []
  const activeRun = runs.find((r) => r.status === "running" || r.status === "pending")
  const latestRun = runs[0] // sorted by created_at desc from server

  const isRunning = activeRun?.status === "running" || activeRun?.status === "pending"
  const isPending = createRun.isPending || executeRun.isPending
  const isCancelling = cancelRun.isPending
  const { isClosed } = useProcessEntry("precios", country.code)
  const canTrigger = !isRunning && !isPending && !isClosed

  const countryLabel = COUNTRY_LABELS[country.code] ?? country.code
  const flag = COUNTRY_FLAGS[country.code] ?? ""

  const handleTrigger = useCallback(async () => {
    try {
      const run = await createRun.mutateAsync({ country: country.code, period: Number(period) })
      await executeRun.mutateAsync(run.run_id)
      toast.success(`Price validation started for ${countryLabel}`)
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? "Unknown error"
      toast.error(`Failed to start validation for ${countryLabel}: ${message}`)
    }
  }, [createRun, executeRun, country.code, period, countryLabel])

  const handleCancel = useCallback(() => {
    if (activeRun) {
      cancelRun.mutate(activeRun.run_id)
      toast.info(`Validation cancelled for ${countryLabel}`)
    }
  }, [cancelRun, activeRun, countryLabel])

  const handleRetry = useCallback(async () => {
    try {
      const run = await createRun.mutateAsync({ country: country.code, period: Number(period) })
      await executeRun.mutateAsync(run.run_id)
      toast.success(`Retrying validation for ${countryLabel}`)
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? "Unknown error"
      toast.error(`Failed to retry validation for ${countryLabel}: ${message}`)
    }
  }, [createRun, executeRun, country.code, period, countryLabel])

  const displayRun = activeRun ?? latestRun
  const statusConfig = displayRun ? PRICES_STATUS_CONFIG[displayRun.status] : null

  return (
    <>
      <Card
        className="cursor-pointer hover:shadow-md transition-shadow"
        role="button"
        tabIndex={0}
        aria-label={`View price validation history for ${countryLabel}`}
        onClick={() => setShowHistory(true)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowHistory(true) } }}
      >
        <CardHeader className="pb-2">
          <div className="space-y-1.5">
            <CardTitle className="text-lg whitespace-nowrap">
              {flag && <span className="mr-2">{flag}</span>}
              {countryLabel}
            </CardTitle>
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                lastValidationDate ? "text-muted-foreground" : "text-warning border-warning/30 bg-warning/15",
              )}
              title={lastValidationDate ? `Last: ${lastValidationDate.replace("T", " ").slice(0, 16)}` : undefined}
            >
              Precios: {lastValidationDate ? formatRelativeTime(lastValidationDate) : "never"}
            </Badge>
            <ProcessStatusBadge stage="precios" country={country.code} countryLabel={countryLabel} />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Progress */}
          {displayRun && (displayRun.status === "running" || displayRun.status === "pending") && (
            <PricesProgress run={displayRun} />
          )}

          {/* Status badge */}
          {displayRun && statusConfig && displayRun.status !== "pending" && displayRun.status !== "running" && (
            <Badge variant={statusConfig.variant} className={statusConfig.className}>
              {statusConfig.label}
            </Badge>
          )}

          {/* Error message */}
          {displayRun?.status === "failed" && displayRun.error_message && (
            <p className="text-xs text-destructive truncate" title={displayRun.error_message}>
              {displayRun.error_message}
            </p>
          )}

          {/* Actions */}
          <div onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap gap-2">
              {/* Trigger / Retry */}
              {displayRun?.status === "failed" ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline" className="flex-1" disabled={isClosed} title={isClosed ? "Proceso cerrado" : undefined}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reintentar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Retry Validation</AlertDialogTitle>
                      <AlertDialogDescription>
                        Retry price validation for <strong>{countryLabel}</strong> period <strong>{period}</strong>?
                        This will create a new validation run.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleRetry}>Retry</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      disabled={!canTrigger}
                      className="flex-1"
                      title={isClosed ? "Proceso cerrado" : undefined}
                    >
                      {isPending || isRunning ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {isPending ? "Iniciando..." : "Ejecutando..."}
                        </>
                      ) : (
                        "Validar"
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirm Price Validation</AlertDialogTitle>
                      <AlertDialogDescription>
                        Start price validation for <strong>{countryLabel}</strong> period <strong>{period}</strong>?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleTrigger}>Confirm</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {/* Cancel */}
              {isRunning && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="destructive"
                      aria-label="Stop validation"
                      disabled={isCancelling}
                    >
                      {isCancelling ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Stop Validation</AlertDialogTitle>
                      <AlertDialogDescription>
                        Stop the running price validation for <strong>{countryLabel}</strong>? This will cancel all pending steps.
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
              )}

              {/* View detail */}
              {displayRun && (
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="View validation details"
                  onClick={() => {
                    setSelectedRun(displayRun)
                    setShowDetail(true)
                  }}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <PricesDetailModal
        run={selectedRun}
        open={showDetail}
        onClose={() => setShowDetail(false)}
      />
      <PricesHistoryModal
        country={country.code}
        countryLabel={countryLabel}
        countryFlag={flag}
        open={showHistory}
        onClose={() => setShowHistory(false)}
      />
    </>
  )
})

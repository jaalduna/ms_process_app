import { useState } from "react"
import { toast } from "sonner"
import { PeriodSelector } from "@/components/PeriodSelector"
import { ProcessWorkspaceTabs } from "@/components/ProcessWorkspaceTabs"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useCountries } from "@/hooks/useCountries"
import { useProcessEntry } from "@/hooks/useProcessStatus"
import { WeightingLaunchPanel } from "../components/WeightingLaunchPanel"
import { WeightingRunCard } from "../components/WeightingRunCard"
import { WeightingDetailModal } from "../components/WeightingDetailModal"
import { WeightingHistoryPanel } from "../components/WeightingHistoryPanel"
import { PesajeParametrosTab } from "../components/PesajeParametrosTab"
import { useLastWeighting } from "../hooks/useLastWeighting"
import { useWeightingBoard } from "../hooks/useWeightingBoard"
import { useCreateWeightingRun, useExecuteWeighting } from "../hooks/useWeighting"
import { COUNTRY_LABELS } from "@/lib/countries"
import type { WeightingRun } from "../types"

function currentPeriod(): string {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const yyyy = prev.getFullYear()
  const mm = String(prev.getMonth() + 1).padStart(2, "0")
  return `${yyyy}${mm}`
}

function periodStringToNumber(period: string): number {
  return parseInt(period, 10)
}

export function PesajePage() {
  const [period, setPeriod] = useState(currentPeriod)
  const { data: countriesData, isLoading: countriesLoading, error: countriesError } = useCountries()
  const { data: lastWeighting } = useLastWeighting()
  const board = useWeightingBoard(period)

  // Single shared launch/detail dialog — opened either from the launch panel
  // (new run for the selected country) or from a run card's "Ver detalle"
  // (existing run). Looked up from the board's per-country data instead of a
  // dedicated query, since the board already fetches every run for this period.
  const [modalCountry, setModalCountry] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const { isClosed } = useProcessEntry("pesaje", modalCountry ?? "")
  const createRun = useCreateWeightingRun()
  const executeRun = useExecuteWeighting()

  const countries = (countriesData?.countries ?? []).filter((c) => c.type === "country")
  const currentRun: WeightingRun | null = modalCountry ? board.latestByCountry.get(modalCountry) ?? null : null

  function openModalFor(countryCode: string) {
    setModalCountry(countryCode)
    setModalOpen(true)
  }

  function handleRun(params: Record<string, unknown>) {
    if (!modalCountry) return
    const countryLabel = COUNTRY_LABELS[modalCountry] ?? modalCountry
    createRun.mutate(
      { country: modalCountry, period: periodStringToNumber(period), parameters: params },
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

  const runningCountries = new Set(
    [...board.latestByCountry.values()]
      .filter((r) => r.status === "pending" || r.status === "running")
      .map((r) => r.country),
  )

  const ejecutar = (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {countriesError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Error al cargar paises: {(countriesError as Error).message}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <div>
          {countriesLoading ? (
            <Skeleton className="h-72 rounded-xl" />
          ) : (
            <WeightingLaunchPanel
              countries={countries}
              period={period}
              lastFinalized={lastWeighting}
              runningCountries={runningCountries}
              onLaunch={openModalFor}
            />
          )}
        </div>

        <div className="space-y-4">
          {board.isLoading && <Skeleton className="h-40 rounded-xl" />}

          {!board.isLoading && board.needsAttention.length === 0 && (
            <Card className="flex flex-col items-center justify-center gap-1 px-4 py-12 text-center text-sm text-muted-foreground">
              <span className="text-2xl">⚖️</span>
              Sin corridas activas para este periodo.
              <span>Selecciona un pais a la izquierda y ejecuta el pipeline.</span>
            </Card>
          )}

          {board.needsAttention.map((run) => (
            <WeightingRunCard
              key={run.run_id}
              run={run}
              onOpenDetail={(r) => openModalFor(r.country)}
              onCancel={board.cancelRun}
              cancelling={board.cancelling}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Historial</h2>
        <WeightingHistoryPanel />
      </div>

      <WeightingDetailModal
        run={currentRun}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onRun={isClosed ? undefined : handleRun}
        countryCode={modalCountry ?? undefined}
        period={period}
      />
    </div>
  )

  const parametros = <PesajeParametrosTab />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pesaje</h1>
        <p className="text-sm text-muted-foreground">
          Ejecuta y monitorea procesos de pesaje por pais
        </p>
      </div>

      <ProcessWorkspaceTabs
        tabs={[
          { value: "ejecutar", label: "Ejecutar", content: ejecutar },
          { value: "parametros", label: "Parametros", content: parametros },
        ]}
      />
    </div>
  )
}

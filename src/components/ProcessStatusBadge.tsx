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
import { Loader2, Lock, LockOpen } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { ApiError, ProcessStage, ProcessState } from "@/types/api"
import { useProcessStatus, useSetProcessStatus } from "@/hooks/useProcessStatus"

// eslint-disable-next-line react-refresh/only-export-components -- co-exported constant used by OverviewPage
export const PROCESS_STAGE_LABELS: Record<ProcessStage, string> = {
  precios: "Precios",
  elegibilidad: "Elegibilidad",
  pesaje: "Pesaje",
  calibracion: "Calibración",
  mtr: "MTR",
}

// eslint-disable-next-line react-refresh/only-export-components -- shared date formatter used by OverviewPage
export function formatProcessChangedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

interface ProcessStatusBadgeProps {
  stage: ProcessStage
  country: string
  countryLabel: string
  /** Show the "por {user} · {fecha}" line under the badge (default true). */
  showAttribution?: boolean
}

/**
 * Open/close toggle for a stage+country process. Self-contained: reads the
 * shared process-status query and mutates with confirmation + toast.
 */
export function ProcessStatusBadge({
  stage,
  country,
  countryLabel,
  showAttribution = true,
}: ProcessStatusBadgeProps) {
  const { data } = useProcessStatus()
  const setStatus = useSetProcessStatus()

  const entry = data?.countries[country]?.[stage]
  const stageLabel = PROCESS_STAGE_LABELS[stage]
  const isOpen = entry?.status === "open"
  const target: ProcessState = isOpen ? "closed" : "open"
  const stateLabel = isOpen ? "Abierto" : "Cerrado"
  const attribution = entry?.changed_by && entry.changed_at
    ? `por ${entry.changed_by} · ${formatProcessChangedAt(entry.changed_at)}`
    : null

  function handleConfirm() {
    setStatus.mutate(
      { stage, country, status: target },
      {
        onSuccess: () =>
          toast.success(
            target === "open"
              ? `Proceso de ${stageLabel} abierto para ${countryLabel}`
              : `Proceso de ${stageLabel} cerrado para ${countryLabel}`,
          ),
        onError: (err) =>
          toast.error(
            (err as unknown as ApiError).message ??
              `Error al actualizar el proceso de ${stageLabel} para ${countryLabel}`,
          ),
      },
    )
  }

  return (
    // Cards in some views open modals on click — keep badge clicks local.
    <div className="flex flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            disabled={setStatus.isPending}
            title={
              attribution
                ? `${stateLabel} ${attribution}. Click para ${isOpen ? "cerrar" : "abrir"}.`
                : `${stateLabel}. Click para ${isOpen ? "cerrar" : "abrir"}.`
            }
            className={cn(
              "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60",
              isOpen
                ? "border-success/30 bg-success/15 text-success hover:bg-success/25"
                : "border-border bg-muted text-muted-foreground hover:bg-accent",
            )}
          >
            {setStatus.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isOpen ? (
              <LockOpen className="h-3 w-3" />
            ) : (
              <Lock className="h-3 w-3" />
            )}
            {stateLabel}
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isOpen ? "Cerrar proceso" : "Abrir proceso"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isOpen ? "Cerrar" : "Abrir"} el proceso de <strong>{stageLabel}</strong> para{" "}
              <strong>{countryLabel}</strong>? El cambio quedara registrado a tu nombre y sera
              visible para todo el equipo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              {isOpen ? "Cerrar proceso" : "Abrir proceso"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {showAttribution && attribution && (
        <span className="text-[10px] leading-tight text-muted-foreground">{attribution}</span>
      )}
    </div>
  )
}

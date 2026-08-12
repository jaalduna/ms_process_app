import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Loader2, Play } from "lucide-react"
import { toast } from "sonner"
import { ADMIN_ONLY_MESSAGE } from "@/lib/permissions"
import { getJVersions } from "@/lib/api"
import { J_SOURCE_SYNC } from "@/types/api"
import { JSourceSelector } from "./JSourceSelector"
import type { CalibrationConfig } from "../types"

interface CalibrateButtonProps {
  /** Código de país (`chile`, `bolivia`, ...). Necesario para listar las versiones de J. */
  country: string
  countryLabel: string
  period: string
  calibrationConfig: CalibrationConfig
  canTrigger: boolean
  /** Permiso de rol para ejecutar; lo calcula la página. Distinto de `canTrigger`,
   * que es disponibilidad de datos / corrida en curso. Default true: los usos
   * presentacionales no cambian, y el permiso real lo impone el backend. */
  canTriggerByRole?: boolean
  isClosed: boolean
  isPending: boolean
  isRunning: boolean
  startCalibration: (params: {
    period: string
    aggregations: CalibrationConfig["aggregations"]
    lookback_months: number
    skip_sync: boolean
    table_suffix: string
    j_source: string
  }) => Promise<unknown>
  /** Fecha del último sync, para mostrarla junto a la opción "sincronizar". */
  lastSyncLabel?: string | null
  className?: string
}

/** "Calibrar" button + confirm dialog, shared between the card and list-row layouts (JAA-763). */
export function CalibrateButton({
  country,
  countryLabel,
  period,
  calibrationConfig,
  canTrigger,
  canTriggerByRole = true,
  isClosed,
  isPending,
  isRunning,
  startCalibration,
  lastSyncLabel,
  className,
}: CalibrateButtonProps) {
  // skip_sync defaults to false: by default the run executes the SQL→bronze sync
  // (check_sync→run_sync). Toggle on to skip it and rely on the daily mirror_sync.
  const [skipSync, setSkipSync] = useState(false)
  // Fuente de J (JAA-1119). Default "sync" = comportamiento de siempre.
  const [jSource, setJSource] = useState<string>(J_SOURCE_SYNC)
  const [dialogOpen, setDialogOpen] = useState(false)
  // Solo se piden las versiones con el diálogo abierto: son N países en pantalla
  // y traerlas todas al montar sería una petición por tarjeta sin que nadie las mire.
  const { data: jVersions, isLoading: jVersionsLoading } = useQuery({
    queryKey: ["j-versions", country],
    queryFn: () => getJVersions({ country }),
    enabled: dialogOpen,
    select: (d) => d.items,
  })
  const usingSavedVersion = jSource !== J_SOURCE_SYNC

  const button = (
    <Button
      size="sm"
      disabled={!canTrigger || !canTriggerByRole}
      className={className}
      aria-label="Calibrar"
      // Sin permiso el motivo lo explica el tooltip: no duplicamos con `title`.
      title={
        !canTriggerByRole
          ? undefined
          : isClosed
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
  )

  // Perfil sin permiso: el botón queda visible pero deshabilitado, y el motivo se
  // explica al pasar el cursor. El <span> es necesario porque un <button disabled>
  // no emite eventos de puntero y el tooltip nunca se abriría. Tampoco montamos el
  // diálogo: así el trigger no puede abrirse por el envoltorio.
  if (!canTriggerByRole) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex" tabIndex={0}>
              {button}
            </span>
          </TooltipTrigger>
          <TooltipContent>{ADMIN_ONLY_MESSAGE}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <AlertDialogTrigger asChild>{button}</AlertDialogTrigger>
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
              <div className="mt-3 rounded-md border p-3">
                <JSourceSelector
                  versions={jVersions ?? []}
                  value={jSource}
                  onChange={setJSource}
                  lastSyncLabel={lastSyncLabel}
                  loading={jVersionsLoading}
                />
              </div>

              {/* Elegir una versión guardada ya implica no sincronizar, así que el
                  toggle sobraría y solo podría contradecir la elección. */}
              {!usingSavedVersion && (
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
              )}
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
                // Con una versión guardada el backend fuerza skip_sync igual;
                // se manda coherente para que el payload no se contradiga.
                skip_sync: usingSavedVersion ? true : skipSync,
                table_suffix: "_full",
                j_source: jSource,
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

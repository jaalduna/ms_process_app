import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Rocket } from "lucide-react"
import { cn } from "@/lib/utils"
import { COUNTRY_FLAGS, COUNTRY_LABELS } from "@/lib/countries"
import { ADMIN_ONLY_MESSAGE } from "@/lib/permissions"
import { getJVersions } from "@/lib/api"
import { J_SOURCE_SYNC, type CountryInfo } from "@/types/api"
import { JSourceSelector } from "./JSourceSelector"

interface ExecutionLaunchPanelProps {
  countries: CountryInfo[]
  period: string
  launching: boolean
  /** Países con una corrida activa (pending/running) en este período: se
   * deshabilitan en el panel — refuerzo UI del guard 409 del backend. */
  runningCountries?: Set<string>
  onLaunch: (
    countryCodes: string[],
    overrides: { skip_sync: boolean; j_source?: string },
  ) => void
  /** Permiso de rol para ejecutar; lo calcula la página. Default true. */
  canTriggerByRole?: boolean
}

/** Launch form of the execution board (mockup v6 "Nueva ejecución" panel):
 * multi-country selection + ONE confirmation for the whole batch. */
export function ExecutionLaunchPanel({ countries, period, launching, runningCountries, onLaunch, canTriggerByRole = true }: ExecutionLaunchPanelProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  // Fuente de J (JAA-1119). Default "sync" = comportamiento de siempre.
  const [jSource, setJSource] = useState<string>(J_SOURCE_SYNC)
  // País al que pertenece `jSource`. Los tags son POR PAÍS y varios países
  // tienen tags con el MISMO nombre (chile y bolivia tienen ambos un
  // `_202607_v2`, que son versiones Delta distintas de tablas distintas). Sin
  // esto, cambiar de país conservaría el tag anterior y se lanzaría contra una
  // versión que no es la que muestra la pantalla.
  const [jSourceCountry, setJSourceCountry] = useState<string | null>(null)

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  // Un país puede pasar a "en curso" DESPUÉS de haber sido seleccionado (otro
  // usuario lanzó, o el poll actualizó): se excluye al momento de lanzar.
  const selectedList = countries.filter(
    (c) => selected.has(c.code) && !(runningCountries?.has(c.code) ?? false),
  )

  // Los tags de versión son POR PAÍS: `_..._202607_v1` de chile y el de bolivia
  // son versiones Delta distintas de tablas distintas. Con varios países
  // seleccionados un solo desplegable no significaría nada, así que la opción
  // solo aparece con exactamente un país. Con más, se sincroniza.
  const soloCountry = selectedList.length === 1 ? selectedList[0].code : null
  const { data: jVersions, isLoading: jVersionsLoading } = useQuery({
    queryKey: ["j-versions", soloCountry],
    queryFn: () => getJVersions({ country: soloCountry! }),
    enabled: Boolean(soloCountry),
    select: (d) => d.items,
  })
  // La elección solo vale para el país en que se hizo. Al pasar a 0, a varios,
  // o a OTRO país, vuelve a sync.
  const effectiveJSource =
    soloCountry && jSourceCountry === soloCountry ? jSource : J_SOURCE_SYNC
  const usingSavedVersion = effectiveJSource !== J_SOURCE_SYNC

  function handleJSourceChange(next: string) {
    setJSource(next)
    setJSourceCountry(soloCountry)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nueva ejecución</CardTitle>
        <p className="text-xs text-muted-foreground">
          Selecciona países y lanza la calibración. Cada país corre como un job propio en
          Databricks, en paralelo.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Países
          </p>
          <div className="grid grid-cols-2 gap-2">
            {countries.map((c) => {
              const isRunning = runningCountries?.has(c.code) ?? false
              const isSel = !isRunning && selected.has(c.code)
              return (
                <label
                  key={c.code}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm font-medium transition-colors",
                    isRunning
                      ? "cursor-not-allowed opacity-50"
                      : isSel
                        ? "cursor-pointer border-primary bg-primary/10"
                        : "cursor-pointer hover:border-muted-foreground/40",
                  )}
                >
                  <Checkbox
                    checked={isSel}
                    disabled={isRunning}
                    onCheckedChange={() => toggle(c.code)}
                  />
                  <span>{COUNTRY_FLAGS[c.code] ?? ""}</span>
                  <span className="truncate">{COUNTRY_LABELS[c.code] ?? c.code}</span>
                  {isRunning && (
                    <span className="ml-auto text-[10px] text-muted-foreground">en curso</span>
                  )}
                </label>
              )
            })}
          </div>
        </div>

        {soloCountry ? (
          <div className="rounded-lg border p-3">
            <JSourceSelector
              versions={jVersions ?? []}
              value={effectiveJSource}
              onChange={handleJSourceChange}
              loading={jVersionsLoading}
              title="Fuente de J"
              syncLabel="Sincronizar J desde SQL Server"
              syncDescription="Trae el estado actual de SQL Server."
            />
          </div>
        ) : (
          <p className="rounded-lg border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
            {selectedList.length > 1
              ? "Con varios países se sincroniza siempre desde SQL Server. Para elegir una versión guardada de J, selecciona un solo país (los tags de versión son por país)."
              : "Cada lanzamiento sincroniza primero los datos desde SQL Server (mirror) y luego corre la calibración — así siempre se calibra con datos al día."}
          </p>
        )}

        {canTriggerByRole ? (
          <Button
            className="w-full"
            disabled={selectedList.length === 0 || launching}
            onClick={() => setConfirmOpen(true)}
          >
            <Rocket className="size-4" />
            Lanzar calibración{selectedList.length > 0 ? ` (${selectedList.length})` : ""}
          </Button>
        ) : (
          // Visible pero deshabilitado; el <span> permite que el tooltip se abra
          // sobre un botón que no emite eventos de puntero.
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex w-full" tabIndex={0}>
                  <Button className="w-full" disabled>
                    <Rocket className="size-4" />
                    Lanzar calibración
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{ADMIN_ONLY_MESSAGE}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Lanzar calibración?</AlertDialogTitle>
            <AlertDialogDescription>
              Se lanzará la calibración del período <strong>{period}</strong> para{" "}
              <strong>
                {selectedList.length} {selectedList.length === 1 ? "país" : "países"}
              </strong>
              :{" "}
              {selectedList
                .map((c) => `${COUNTRY_FLAGS[c.code] ?? ""} ${COUNTRY_LABELS[c.code] ?? c.code}`)
                .join(", ")}
              .{" "}
              {usingSavedVersion ? (
                <>
                  <strong>No se sincroniza</strong>: se calibra sobre la versión guardada{" "}
                  <code>{effectiveJSource}</code>, tal como quedó.
                </>
              ) : (
                <>
                  Primero se sincronizan los datos y luego corre la calibración; los países van
                  en paralelo, cada uno en su propio job de Databricks.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false)
                // La sincronización corre siempre SALVO que se haya elegido una
                // versión guardada de J: ahí sincronizar reescribiría J justo
                // antes de leer una versión congelada (el backend fuerza
                // skip_sync igual; se manda coherente). Fuera de ese caso sigue
                // valiendo la decisión 2026-07-29: este tablero no ofrece saltar
                // la sync.
                onLaunch(selectedList.map((c) => c.code), {
                  skip_sync: usingSavedVersion,
                  j_source: effectiveJSource,
                })
              }}
            >
              Sí, lanzar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

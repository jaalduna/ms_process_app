import { useState } from "react"
import { Loader2, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { mensajeError } from "@/modules/qmstr/components/flujo/formato"
import { useCrearEscenario, type Cierre } from "../hooks"
import type { Ajustes, Engine, Parametros, Simulacion, ValoresParametros } from "../types"
import type { ConfigProceso } from "../config"
import { ParametrosPanel } from "./ParametrosPanel"
import { Kpis } from "./piezas"

export function IterarPaso({
  config, cierre, parametros, valores, ajustes, simulacion, onValores, onAjustes, onVerComparacion,
  manual = false, pendiente = false, onCalcular, engine,
}: {
  config: ConfigProceso
  cierre: Cierre
  parametros: Parametros | undefined
  valores: ValoresParametros | undefined
  ajustes: Ajustes
  simulacion: { data: Simulacion | undefined; isFetching: boolean; error: unknown; espera?: number | null }
  onValores: (v: ValoresParametros) => void
  onAjustes: (a: Ajustes) => void
  onVerComparacion: () => void
  /** El proceso real no recalcula solo: se pide con «Calcular». */
  manual?: boolean
  /** Hay cambios sin calcular. */
  pendiente?: boolean
  onCalcular?: () => void
  engine?: Engine
}) {
  const [nombre, setNombre] = useState("")
  const crear = useCrearEscenario(cierre)

  if (!parametros || !valores) return <Skeleton className="h-96 rounded-xl" />

  const guardar = () => {
    const n = nombre.trim()
    if (!n) {
      toast.error("Ponle un nombre al escenario")
      return
    }
    crear.mutate(
      { nombre: n, parametros: valores, ajustes },
      {
        onSuccess: (e) => {
          setNombre("")
          toast.success(`Escenario «${e.nombre}» guardado`, {
            action: { label: "Comparar", onClick: onVerComparacion },
          })
        },
        onError: (e) => toast.error(`No se pudo guardar: ${mensajeError(e)}`),
      },
    )
  }

  const sim = simulacion.data
  const Lateral = config.AjustesLaterales

  return (
    <div className="flex flex-wrap items-start gap-5">
      <Card className="w-full max-w-sm flex-[1_1_300px] gap-5 p-5 lg:sticky lg:top-4">
        <div>
          <h2 className="text-base font-semibold">Parámetros</h2>
          <p className="text-sm text-muted-foreground">
            {manual
              ? config.proceso === "pesaje"
                ? "Corre el proceso real sobre los datos preparados (unos 20 segundos por IdPeso)."
                : "Corre el proceso real sobre los datos preparados (de segundos a un par de minutos según el país)."
              : "Cada cambio recalcula sobre los datos preparados."}
          </p>
        </div>
        {Lateral && <Lateral ajustes={ajustes} onAjustes={onAjustes} idpesos={parametros.idpesos} engine={engine} />}
        <ParametrosPanel
          definiciones={parametros.definiciones}
          valores={valores}
          referencia={parametros.referencia.valores}
          onChange={(clave, v) => onValores({ ...valores, [clave]: v })}
        />
        <Button
          variant="ghost"
          className="self-start"
          onClick={() => {
            onValores({ ...parametros.referencia.valores })
            onAjustes(parametros.ajustes ?? config.ajustesIniciales)
          }}
        >
          <RotateCcw aria-hidden /> Volver a {parametros.referencia.etiqueta.toLowerCase()}
        </Button>
        {manual && (
          <Button onClick={onCalcular} disabled={!pendiente || simulacion.isFetching} data-testid="it-calcular">
            {simulacion.isFetching && <Loader2 className="animate-spin" aria-hidden />}
            {simulacion.isFetching ? "Calculando…" : pendiente ? "Calcular con estos parámetros" : "Calculado"}
          </Button>
        )}
        <div className="space-y-2 border-t pt-4">
          <label htmlFor="it-nombre-escenario" className="text-sm font-medium">
            Guardar esta vuelta como escenario
          </label>
          <Input
            id="it-nombre-escenario"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && guardar()}
            placeholder="Ej.: f_ok 92% sin Norte"
          />
          <Button variant="outline" className="w-full" onClick={guardar} disabled={crear.isPending} data-testid="it-guardar-escenario">
            {crear.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Guardar escenario
          </Button>
        </div>
      </Card>

      <div className="min-w-0 flex-[999_1_560px] space-y-5" aria-busy={simulacion.isFetching}>
        <div className="flex min-h-5 items-center justify-end text-xs text-muted-foreground" role="status">
          {simulacion.isFetching ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />{" "}
              {manual ? "Corriendo el proceso real…" : "Recalculando…"}
              {simulacion.espera != null && simulacion.espera > 0 && ` ${simulacion.espera} s`}
            </span>
          ) : sim ? (
            <span>
              {manual
                ? "Calculado con el proceso real"
                : `Calculado en ${(sim.duracion_ms / 1000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} s`}
            </span>
          ) : null}
        </div>
        {simulacion.error != null && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
            No se pudo simular: {mensajeError(simulacion.error)}
          </div>
        )}
        {!sim && !simulacion.error && <Skeleton className="h-96 rounded-xl" />}
        {sim && (
          <div className={simulacion.isFetching ? "opacity-70 transition-opacity" : "transition-opacity"}>
            <div className="space-y-5">
              <Kpis kpis={sim.kpis} />
              {pendiente && (
                <p className="rounded-md bg-muted px-3 py-2 text-sm" role="status">
                  Estos resultados son de los parámetros anteriores. Pulsa «Calcular» para ver los nuevos.
                </p>
              )}
              <config.Resultado resultado={sim.resultado} ajustes={ajustes} onAjustes={onAjustes} engine={engine} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

import { useState } from "react"
import { Loader2, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { mensajeError } from "@/modules/qmstr/components/flujo/formato"
import { useCrearEscenario, type Cierre } from "../hooks"
import type { Ajustes, Engine, Parametros, Simulacion, ValoresParametros } from "../types"
import type { ConfigProceso } from "../config"
import { AnchoCompletoContext } from "../anchoCompleto"
import { duracion, valorParametro } from "../format"
import { ConfigPaisSeccion } from "./ConfigPais"
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
  // null: se muestra el nombre sugerido; al escribir queda el del usuario
  const [nombre, setNombre] = useState<string | null>(null)
  const [ancho, setAncho] = useState<HTMLDivElement | null>(null)
  const crear = useCrearEscenario(cierre)

  if (!parametros || !valores) return <Skeleton className="h-96 rounded-xl" />

  const sugerido = nombreSugerido(config, parametros, valores, ajustes)
  const guardar = () => {
    const n = (nombre ?? sugerido).trim()
    if (!n) {
      toast.error("Ponle un nombre al escenario")
      return
    }
    crear.mutate(
      { nombre: n, parametros: valores, ajustes },
      {
        onSuccess: (e) => {
          setNombre(null)
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
  const Editor = config.EditorDatos
  const bloqueo = config.bloqueoCalcular?.(ajustes, parametros) ?? null

  return (
    <AnchoCompletoContext.Provider value={ancho}>
    {/* dos columnas que terminan a la misma altura (la última tarjeta de cada una se estira) y, bajo
        ellas, las secciones anchas del resultado a todo el ancho */}
    <div className="flex flex-wrap items-stretch gap-5">
      {/* columna de entradas: parámetros y, debajo, los targets por segmento (la matriz se abre aparte) */}
      <div className="flex w-full max-w-sm flex-[1_1_300px] flex-col gap-5 [&>*:last-child]:flex-1">
        <Card className="gap-5 p-5">
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
          {parametros.config_pais && (
            <ConfigPaisSeccion items={config.configPais} config={parametros.config_pais} cierre={cierre} />
          )}
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
            <Button onClick={onCalcular} disabled={!pendiente || simulacion.isFetching || bloqueo !== null} data-testid="it-calcular">
              {simulacion.isFetching && <Loader2 className="animate-spin" aria-hidden />}
              {simulacion.isFetching ? "Calculando…" : pendiente ? "Calcular con estos parámetros" : "Calculado"}
            </Button>
          )}
          {bloqueo && (
            <p className="text-xs text-destructive" role="status" data-testid="it-bloqueo-calcular">
              No se puede calcular: {bloqueo}.
            </p>
          )}
          {/* bajo «Calcular»: cuánto lleva la corrida y con qué se calculó */}
          <div className="-mt-3 flex min-h-4 items-center justify-center text-xs text-muted-foreground" role="status" data-testid="it-estado-calculo">
            {simulacion.isFetching ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />{" "}
                {manual ? "Corriendo el proceso real…" : "Recalculando…"}
                {simulacion.espera != null && simulacion.espera > 0 && ` ${duracion(simulacion.espera)}`}
              </span>
            ) : sim ? (
              <span>
                {manual
                  ? "Calculado con el proceso real"
                  : `Calculado en ${(sim.duracion_ms / 1000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} s`}
              </span>
            ) : null}
          </div>
          <div className="space-y-2 border-t pt-4">
            <label htmlFor="it-nombre-escenario" className="text-sm font-medium">
              Guardar esta vuelta como escenario
            </label>
            <Input
              id="it-nombre-escenario"
              value={nombre ?? sugerido}
              onChange={(e) => setNombre(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => e.key === "Enter" && guardar()}
              placeholder="Nombre del escenario"
            />
            <Button variant="outline" className="w-full" onClick={guardar} disabled={crear.isPending} data-testid="it-guardar-escenario">
              {crear.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Guardar escenario
            </Button>
          </div>
        </Card>
        {Editor && (
          <Editor parametros={parametros} ajustes={ajustes} onAjustes={onAjustes} resultado={sim?.resultado} engine={engine} />
        )}
      </div>

      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 [&>*:last-child]:flex-1" aria-busy={simulacion.isFetching}>
        {simulacion.error != null && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
            No se pudo simular: {mensajeError(simulacion.error)}
          </div>
        )}
        {!sim && !simulacion.error && <Skeleton className="h-96 rounded-xl" />}
        {sim && (
          <div className={cn("flex flex-col transition-opacity", simulacion.isFetching && "opacity-70")}>
            <div className="flex flex-1 flex-col gap-5 [&>*:last-child]:flex-1">
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
      <div ref={setAncho} className="min-w-0 basis-full empty:hidden" data-testid="it-ancho-completo" />
    </div>
    </AnchoCompletoContext.Provider>
  )
}

/** Nombre por defecto de la vuelta: lo que cambió respecto del país y la hora, para distinguirla. */
function nombreSugerido(config: ConfigProceso, parametros: Parametros, valores: ValoresParametros, ajustes: Ajustes): string {
  const ref = parametros.referencia.valores
  const cambiados = parametros.definiciones
    .filter((d) => valores[d.clave] !== ref[d.clave])
    .map((d) => `${d.clave} ${valorParametro(d, valores[d.clave])}`)
  const partes = cambiados.length > 3 ? [...cambiados.slice(0, 3), `+${cambiados.length - 3}`] : cambiados
  if (JSON.stringify(ajustes) !== JSON.stringify(parametros.ajustes ?? config.ajustesIniciales)) {
    partes.push(config.describirAjustes(ajustes, parametros.idpesos))
  }
  const hora = new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
  return `${partes.length ? partes.join(" · ") : "Parámetros del país"} · ${hora}`
}

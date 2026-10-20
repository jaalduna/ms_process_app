import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { PeriodSelector } from "@/components/PeriodSelector"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { mensajeError } from "@/modules/qmstr/components/flujo/formato"
import type { ConfigProceso } from "../config"
import { useParametros, usePaises, usePreparacion, useSimulacion, type Cierre } from "../hooks"
import type { Ajustes, PaisIteracion, ValoresParametros } from "../types"
import { CompararPaso } from "./CompararPaso"
import { IterarPaso } from "./IterarPaso"
import { Bandera } from "./Bandera"
import { AvisoMotor } from "./piezas"
import { PrepararPaso } from "./PrepararPaso"
import { PublicarPaso } from "./PublicarPaso"

const PASOS = [
  { id: "preparar", nombre: "Preparar" },
  { id: "iterar", nombre: "Iterar" },
  { id: "comparar", nombre: "Comparar" },
  { id: "publicar", nombre: "Aprobar y publicar" },
] as const
type Paso = (typeof PASOS)[number]["id"]

/** Último mes cerrado: el período con el que se trabaja por defecto. */
function periodoPorDefecto(): string {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${prev.getFullYear()}${String(prev.getMonth() + 1).padStart(2, "0")}`
}

/**
 * Flujo común de Elegibilidad y Pesaje (specs/SPEC-iteracion.md): preparar una vez, iterar sobre
 * los datos preparados, comparar escenarios y publicar con aprobación. País, período y paso viven
 * en la URL para que un enlace lleve al mismo lugar.
 */
export function IteracionWorkspace({ config }: { config: ConfigProceso }) {
  const [sp, setSp] = useSearchParams()
  const paises = usePaises(config.proceso)
  const pais = sp.get("pais") ?? paises.data?.[0]?.id ?? ""
  const periodo = sp.get("periodo") ?? periodoPorDefecto()
  const pasoUrl = sp.get("paso") as Paso | null
  const cierre: Cierre = { proceso: config.proceso, pais, periodo }

  const preparacion = usePreparacion(cierre)
  const lista = preparacion.data?.estado === "lista"
  const paso: Paso = lista && pasoUrl && PASOS.some((p) => p.id === pasoUrl) ? pasoUrl : "preparar"
  const parametros = useParametros(cierre, lista)

  // Lo que el usuario movió en cada cierre; si no tocó nada, rigen los valores que entrega la API.
  const [edicion, setEdicion] = useState<Record<string, { valores?: ValoresParametros; ajustes?: Ajustes }>>({})
  const clave = `${pais}|${periodo}`
  const valores = edicion[clave]?.valores ?? parametros.data?.valores
  const ajustesBase = parametros.data?.ajustes ?? config.ajustesIniciales
  const ajustes = edicion[clave]?.ajustes ?? ajustesBase
  const editar = (cambio: { valores?: ValoresParametros; ajustes?: Ajustes }) =>
    setEdicion((prev) => ({ ...prev, [clave]: { ...prev[clave], ...cambio } }))

  // Con el proceso real cada vuelta toma ~20 s: se calcula al pedirlo, no en cada movimiento.
  const manual = preparacion.data?.engine === "real"
  const [calculado, setCalculado] = useState<Record<string, { parametros: ValoresParametros; ajustes: Ajustes }>>({})
  const actual = valores ? { parametros: valores, ajustes } : null
  const base = parametros.data ? { parametros: parametros.data.valores, ajustes: ajustesBase } : null
  const pedida = manual ? (calculado[clave] ?? base) : actual
  const pendiente = manual && !!actual && JSON.stringify(actual) !== JSON.stringify(pedida)
  const simulacion = useSimulacion(cierre, paso === "iterar" && lista ? pedida : null)

  const ir = (cambios: Record<string, string>) =>
    setSp((prev) => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(cambios)) next.set(k, v)
      return next
    })
  const irPaso = (p: Paso) => ir({ paso: p })

  const engine = simulacion.data?.engine ?? preparacion.data?.engine

  return (
    <div className="qf space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{config.titulo}</h1>
          <p className="text-sm text-muted-foreground">{config.descripcion}</p>
        </div>
        <PeriodSelector value={periodo} onChange={(p) => ir({ periodo: p, paso: "preparar" })} />
      </div>

      {paises.error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          No se pudieron cargar los países: {mensajeError(paises.error)}
        </div>
      ) : !paises.data ? (
        <Skeleton className="h-10 w-96 rounded-lg" />
      ) : (
        <SelectorPais paises={paises.data} valor={pais} onChange={(p) => ir({ pais: p, paso: "preparar" })} />
      )}

      <AvisoMotor engine={engine} proceso={config.proceso} />

      <nav aria-label="Pasos" className="flex flex-wrap gap-1 border-b">
        {PASOS.map((p, i) => {
          const activo = p.id === paso
          const habilitado = p.id === "preparar" || lista
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => irPaso(p.id)}
              disabled={!habilitado}
              aria-current={activo ? "step" : undefined}
              title={habilitado ? undefined : "Primero prepara los datos del cierre"}
              data-testid={`it-paso-${p.id}`}
              className={cn(
                "-mb-px inline-flex items-center gap-2 border-b-[3px] px-3 py-3 text-sm transition-colors",
                "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45",
                activo ? "border-[var(--qf-wp-blue)] font-semibold" : "border-transparent hover:text-foreground text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                  activo ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                )}
              >
                {i + 1}
              </span>
              {p.nombre}
            </button>
          )
        })}
      </nav>

      {preparacion.error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          No se pudo leer el estado del cierre: {mensajeError(preparacion.error)}
        </div>
      ) : paso === "preparar" ? (
        <PrepararPaso
          cierre={cierre}
          preparacion={preparacion.data}
          cargando={preparacion.isLoading || !pais}
          onContinuar={() => irPaso("iterar")}
        />
      ) : paso === "iterar" ? (
        <IterarPaso
          config={config}
          cierre={cierre}
          parametros={parametros.data}
          valores={valores}
          ajustes={ajustes}
          simulacion={simulacion}
          onValores={(v) => editar({ valores: v })}
          onAjustes={(a) => editar({ ajustes: a })}
          onVerComparacion={() => irPaso("comparar")}
          manual={manual}
          pendiente={pendiente}
          onCalcular={() => actual && setCalculado((prev) => ({ ...prev, [clave]: actual }))}
          engine={engine}
        />
      ) : paso === "comparar" ? (
        <CompararPaso
          config={config}
          cierre={cierre}
          parametros={parametros.data}
          onIterar={() => irPaso("iterar")}
          onPublicar={() => irPaso("publicar")}
        />
      ) : (
        <PublicarPaso config={config} cierre={cierre} />
      )}
    </div>
  )
}

function SelectorPais({ paises, valor, onChange }: { paises: PaisIteracion[]; valor: string; onChange: (id: string) => void }) {
  const grupos = [
    { panel: "hogares" as const, titulo: "Hogares" },
    { panel: "ooh" as const, titulo: "OOH · individuos" },
  ].filter((g) => paises.some((p) => p.panel === g.panel))
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3">
      {grupos.map((g) => (
        <fieldset key={g.panel} className="space-y-1.5">
          {grupos.length > 1 && <legend className="text-xs font-medium text-muted-foreground">{g.titulo}</legend>}
          {grupos.length === 1 && <legend className="sr-only">País</legend>}
          <div className="flex flex-wrap gap-1.5">
            {paises
              .filter((p) => p.panel === g.panel)
              .map((p) => {
                const on = p.id === valor
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange(p.id)}
                    data-testid={`it-pais-${p.id}`}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                      on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
                    )}
                  >
                    <Bandera pais={p.id} />
                    {p.label}
                  </button>
                )
              })}
          </div>
        </fieldset>
      ))}
    </div>
  )
}

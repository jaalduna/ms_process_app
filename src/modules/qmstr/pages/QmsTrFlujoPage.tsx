import { useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { AlertOctagon, CalendarClock, FlaskConical, Inbox, Layers, Loader2, RefreshCw, Rocket, ShieldCheck, Table2, Workflow } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/hooks/useAuth"
import { useNow } from "@/hooks/useNow"
import { COUNTRY_FLAGS } from "@/lib/countries"
import { getPermissions } from "@/lib/permissions"
import { cn } from "@/lib/utils"
import type { AccionTanda } from "../api"
import {
  useAccionTanda, useCrearTanda, useFlujoBases, useFlujoCorreos, useFlujoEstado, useFlujoPaises, useFlujoPeriodos,
  useFlujoTandas, useForzarVuelta, useRevertirTanda,
} from "../hooks/useQmsTrFlujo"
import { BandejaCorreos } from "../components/flujo/BandejaCorreos"
import { OverrideDialog } from "../components/flujo/OverrideDialog"
import { RevertirDialog } from "../components/flujo/RevertirDialog"
import { TablaBases } from "../components/flujo/TablaBases"
import { TableroBases } from "../components/flujo/TableroBases"
import { TandaCard } from "../components/flujo/TandaCard"
import { mensajeError, periodoLabel, relativo } from "../components/flujo/formato"
import { Chip, Vacio } from "../components/flujo/piezas"
import { TANDA_ACTIVOS, type EstadoBase, type FlujoEstado, type Tanda, type TandaCreate } from "../types"

const ACCION_OK: Record<AccionTanda, string> = {
  pausar: "pausada",
  reanudar: "reanudada",
  reintentar: "vuelve a intentarse",
  simular_cierre_ticket: "con el ticket cerrado (simulado)",
}

function EstadoLoop({ estado }: { estado: FlujoEstado }) {
  const ahora = useNow(true, 30_000)
  const min = Math.round(estado.intervalo_segundos / 60)
  if (estado.error_config) {
    return <Chip tone="var(--destructive)" dot="solid" title={estado.error_config}>Flujo detenido: {estado.error_config}</Chip>
  }
  if (!estado.enabled) return <Chip tone="var(--qf-bypass)" dot="solid">Flujo apagado</Chip>
  const errores = Object.entries(estado.resultado ?? {}).filter(([, r]) => r !== "ok")
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="qf-loop"
      title={`El flujo revisa los hitos cada ${min} min`}>
      <CalendarClock className="size-3.5" />
      {estado.ultima_vuelta ? <>Última vuelta {relativo(estado.ultima_vuelta, ahora)}, cada {min} min</> : <>Sin vueltas todavía, cada {min} min</>}
      {errores.length > 0 && <Chip tone="var(--destructive)" className="ml-1">{errores.map(([p]) => p).join(", ")} con error</Chip>}
    </span>
  )
}

export function QmsTrFlujoPage() {
  const { roles } = useAuth()
  const { canAdminQmsTrFlujo: esAdmin, canViewDatabricksRun } = getPermissions(roles)
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState("tandas")
  const [filtro, setFiltro] = useState<EstadoBase | null>(null)
  const [override, setOverride] = useState(false)
  const [aRevertir, setARevertir] = useState<Tanda | null>(null)

  const estado = useFlujoEstado()
  const paises = useFlujoPaises()
  const pais = params.get("pais") ?? paises.data?.[0]?.codigo
  const periodos = useFlujoPeriodos(pais)
  const periodo = params.get("periodo") ?? periodos.data?.[0]?.periodo
  const tandas = useFlujoTandas(pais, periodo)
  const hayActivas = (tandas.data ?? []).some((t) => TANDA_ACTIVOS.includes(t.estado) && !t.pausada)
  const bases = useFlujoBases(pais, periodo, hayActivas)
  const correos = useFlujoCorreos(pais, periodo)

  const crear = useCrearTanda()
  const revertir = useRevertirTanda()
  const accion = useAccionTanda()
  const vuelta = useForzarVuelta()

  const etiqueta = paises.data?.find((p) => p.codigo === pais)
  const nombres = useMemo(() => new Map((bases.data ?? []).map((b) => [b.producto, b.nombre])), [bases.data])
  const ordenadas = useMemo(() => {
    const vivas = (t: Tanda) => TANDA_ACTIVOS.includes(t.estado) || t.estado === "revision_manual"
    return [...(tandas.data ?? [])].sort((a, b) => Number(vivas(b)) - Number(vivas(a)) || b.numero - a.numero)
  }, [tandas.data])
  const porId = useMemo(() => new Map((tandas.data ?? []).map((t) => [t.id, t])), [tandas.data])

  function elegir(nuevo: { pais?: string; periodo?: string }) {
    const p = new URLSearchParams(params)
    if (nuevo.pais) {
      p.set("pais", nuevo.pais)
      p.delete("periodo")
    }
    if (nuevo.periodo) p.set("periodo", nuevo.periodo)
    setParams(p, { replace: true })
    setFiltro(null)
  }

  function lanzar(data: TandaCreate) {
    crear.mutate(data, {
      onSuccess: (t) => {
        setOverride(false)
        setFiltro(null)
        setParams({ pais: t.pais, periodo: t.periodo }, { replace: true })
        setTab("tandas")
        toast.success(`Tanda ${t.numero} lanzada: ${t.productos.length} bases de ${t.pais} ${t.periodo}`)
      },
      onError: (e) => toast.error(`No se pudo lanzar QMS-TR: ${mensajeError(e)}`),
    })
  }

  function hacer(t: Tanda, a: AccionTanda) {
    accion.mutate({ tid: t.id, accion: a }, {
      onSuccess: () => toast.success(`Tanda ${t.numero} ${ACCION_OK[a]}`),
      onError: (e) => toast.error(`No se pudo completar la acción en la tanda ${t.numero}: ${mensajeError(e)}`),
    })
  }

  function confirmarReversion(productos: number[], motivo: string) {
    if (!aRevertir) return
    const origen = aRevertir
    revertir.mutate({ tid: origen.id, productos, motivo }, {
      onSuccess: (t) => {
        setARevertir(null)
        toast.success(`Reversión en marcha (tanda ${t.numero}): ${productos.length} bases de la tanda ${origen.numero}`)
      },
      onError: (e) => toast.error(`No se pudo revertir: ${mensajeError(e)}`),
    })
  }

  const errorCarga = estado.error ?? paises.error
  const modo = estado.data?.modo

  return (
    <div className="qf mx-auto max-w-7xl space-y-6 p-4 sm:p-6" data-testid="qf-page">
      {/* cabecera */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-[26rem]">
          <div className="flex flex-wrap items-center gap-2.5">
            <Workflow className="size-6 text-primary" />
            <h1 className="font-display text-2xl font-bold tracking-tight">Flujo QMS-TR</h1>
            {modo === "simulacion" && (
              <Chip tone="var(--qf-retenida)" dot="solid" data-testid="qf-modo" title="Databricks corre de verdad; Jira, correos y el hito 10 solo se simulan">
                <FlaskConical className="size-3" /> Simulación
              </Chip>
            )}
            {modo === "real" && (
              <Chip tone="var(--qf-aplicada)" dot="pulse" data-testid="qf-modo" title="Crea tickets, envía correos y escribe el hito 10">
                <ShieldCheck className="size-3" /> Real
              </Chip>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Cada liberación metodológica pasa sola por QMS-TR: corrida, envío a DQ, verificación en J y hito 10.
          </p>
          <div className="mt-1.5">{estado.data && <EstadoLoop estado={estado.data} />}</div>
        </div>
        {esAdmin && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => vuelta.mutate(undefined, {
              onSuccess: () => toast.success("Vuelta lista: el flujo revisó los hitos de todos los países"),
              onError: (e) => toast.error(`No se pudo forzar la vuelta: ${mensajeError(e)}`),
            })} disabled={vuelta.isPending || !estado.data?.enabled} data-testid="qf-forzar-vuelta">
              {vuelta.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Forzar vuelta
            </Button>
            <Button onClick={() => setOverride(true)} disabled={!paises.data?.length} data-testid="qf-lanzar">
              <Rocket /> Lanzar QMS-TR
            </Button>
          </div>
        )}
      </header>

      {errorCarga ? (
        <Vacio role="alert" icon={<AlertOctagon />} tono="var(--destructive)" titulo="No se pudo leer el estado del flujo"
          accion={<Button variant="outline" onClick={() => { estado.refetch(); paises.refetch() }}><RefreshCw /> Reintentar</Button>}>
          {mensajeError(errorCarga)}
        </Vacio>
      ) : (
        <>
          {/* selectores */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label="País" data-testid="qf-paises">
              {paises.isLoading && <Skeleton className="h-8 w-48" />}
              {paises.data?.map((p) => (
                <button key={p.codigo} type="button" role="radio" aria-checked={p.codigo === pais} onClick={() => elegir({ pais: p.codigo })}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    p.codigo === pais ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}>
                  <span aria-hidden className="text-base leading-none">{COUNTRY_FLAGS[p.nombre] ?? ""}</span>
                  {p.etiqueta}
                </button>
              ))}
            </div>
            <Select value={periodo ?? ""} onValueChange={(v) => elegir({ periodo: v })} disabled={!periodos.data?.length}>
              <SelectTrigger className="h-10 w-auto min-w-56 rounded-xl" aria-label="Período productivo" data-testid="qf-periodo">
                <SelectValue placeholder={periodos.isLoading ? "Cargando períodos…" : "Sin períodos"} />
              </SelectTrigger>
              <SelectContent>
                {periodos.data?.map((p) => (
                  <SelectItem key={p.periodo} value={p.periodo}>
                    <span className="first-letter:uppercase">{periodoLabel(p.periodo)}</span>
                    <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                      {p.h4} con hito 4{p.h10 ? `, ${p.h10} con hito 10` : ""}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* tablero */}
          {bases.isLoading || !pais || !periodo ? (
            <Skeleton className="h-72 w-full rounded-2xl" />
          ) : bases.error ? (
            <Vacio role="alert" icon={<AlertOctagon />} tono="var(--destructive)" titulo="No se pudieron leer las bases"
              accion={<Button variant="outline" onClick={() => bases.refetch()}><RefreshCw /> Reintentar</Button>}>
              {mensajeError(bases.error)}
            </Vacio>
          ) : bases.data && bases.data.length > 0 ? (
            <TableroBases pais={etiqueta?.etiqueta ?? pais} periodo={periodo} bases={bases.data} filtro={filtro}
              onFiltro={(f) => { setFiltro(f); if (f) setTab("bases") }} />
          ) : (
            <Vacio icon={<Layers />} titulo={`Sin hitos en ${periodoLabel(periodo)}`}>
              Todavía no hay hitos 3 ni 4 para este período. Apenas DC libere, las bases aparecen acá.
            </Vacio>
          )}

          {/* pestañas */}
          {pais && periodo && (
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="h-10 max-w-full justify-start overflow-x-auto rounded-xl">
                <TabsTrigger value="tandas" className="rounded-lg" data-testid="qf-tab-tandas">
                  <Workflow className="size-4" /> Tandas <span className="tabular-nums opacity-60">{tandas.data?.length ?? ""}</span>
                </TabsTrigger>
                <TabsTrigger value="bases" className="rounded-lg" data-testid="qf-tab-bases">
                  <Table2 className="size-4" /> Bases <span className="tabular-nums opacity-60">{bases.data?.length ?? ""}</span>
                </TabsTrigger>
                <TabsTrigger value="correos" className="rounded-lg" data-testid="qf-tab-correos">
                  <Inbox className="size-4" /> Correos <span className="tabular-nums opacity-60">{correos.data?.length ?? ""}</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="tandas" className="space-y-4">
                {tandas.isLoading ? (
                  <Skeleton className="h-64 w-full rounded-2xl" />
                ) : tandas.error ? (
                  <Vacio role="alert" icon={<AlertOctagon />} tono="var(--destructive)" titulo="No se pudieron leer las tandas">
                    {mensajeError(tandas.error)}
                  </Vacio>
                ) : ordenadas.length === 0 ? (
                  <Vacio icon={<Workflow />} titulo="Ninguna tanda en este período"
                    accion={esAdmin && <Button onClick={() => setOverride(true)}><Rocket /> Lanzar QMS-TR</Button>}>
                    El flujo arma una tanda cuando DC registra el hito 4. Si necesitas correr antes, lánzala a mano.
                  </Vacio>
                ) : (
                  ordenadas.map((t) => (
                    <TandaCard
                      key={t.id}
                      tanda={t}
                      nombres={nombres}
                      modo={modo ?? "simulacion"}
                      esAdmin={esAdmin}
                      verRun={canViewDatabricksRun}
                      origen={t.tanda_origen ? porId.get(t.tanda_origen) : undefined}
                      ocupado={accion.isPending && accion.variables?.tid === t.id ? accion.variables.accion : null}
                      onAccion={(a) => hacer(t, a)}
                      onRevertir={() => setARevertir(t)}
                    />
                  ))
                )}
              </TabsContent>

              <TabsContent value="bases">
                {bases.data && <TablaBases bases={bases.data} filtro={filtro} onFiltro={setFiltro} />}
              </TabsContent>

              <TabsContent value="correos">
                {correos.isLoading ? <Skeleton className="h-80 w-full rounded-2xl" /> : correos.error ? (
                  <Vacio role="alert" icon={<AlertOctagon />} tono="var(--destructive)" titulo="No se pudo leer la bandeja">
                    {mensajeError(correos.error)}
                  </Vacio>
                ) : <BandejaCorreos correos={correos.data ?? []} tandas={tandas.data ?? []} />}
              </TabsContent>
            </Tabs>
          )}
        </>
      )}

      {paises.data && pais && (
        <OverrideDialog open={override} onOpenChange={setOverride} paises={paises.data} paisInicial={pais}
          periodoInicial={periodo ?? ""} lanzando={crear.isPending} onLanzar={lanzar} />
      )}
      <RevertirDialog
        tanda={aRevertir}
        yaRevertidas={new Set((tandas.data ?? []).filter((t) => t.tipo === "reversion" && t.tanda_origen === aRevertir?.id).flatMap((t) => t.productos))}
        nombres={nombres}
        revirtiendo={revertir.isPending}
        onOpenChange={(o) => { if (!o) setARevertir(null) }}
        onRevertir={confirmarReversion}
      />
    </div>
  )
}

import { useMemo, useState } from "react"
import { ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { num, pct, pp, periodoLabel, TONO, textoTono } from "../format"
import type { AjustesElegibilidad, RegionElegibilidad, ResultadoElegibilidad } from "../types"
import { Seccion } from "./piezas"

const ESTADO: Record<RegionElegibilidad["estado"], { texto: string; plural: string; tono: string; relleno: string }> = {
  ok: { texto: "OK", plural: "OK", tono: TONO.ok, relleno: "var(--qf-wp-blue)" },
  justo: { texto: "Justo", plural: "justas", tono: TONO.aviso, relleno: "var(--warning)" },
  deficit: { texto: "Déficit", plural: "en déficit", tono: TONO.error, relleno: "#f871a0" },
  cerrada: { texto: "Sin imputar", plural: "sin imputar", tono: TONO.neutro, relleno: "var(--muted-foreground)" },
}

export function ResultadoElegibilidadView({ resultado, ajustes, onAjustes }: {
  resultado: ResultadoElegibilidad
  ajustes: AjustesElegibilidad
  onAjustes: (a: AjustesElegibilidad) => void
}) {
  const cambiar = (cerradas: string[]) => onAjustes({ regiones_cerradas: cerradas })
  const alternar = (r: RegionElegibilidad) => {
    const antes = ajustes.regiones_cerradas
    const excluir = !antes.includes(r.id)
    cambiar(excluir ? [...antes, r.id] : antes.filter((x) => x !== r.id))
    toast(excluir ? `${r.nombre} no se imputará` : `${r.nombre} vuelve a imputarse`, {
      description: excluir
        ? "La región queda con sus elegibles naturales, sin donantes. Se aplica en la próxima vuelta."
        : "Se aplica en la próxima vuelta.",
      action: { label: "Deshacer", onClick: () => cambiar(antes) },
    })
  }

  if (resultado.parcial) {
    return (
      <div className="rounded-lg border px-4 py-3 text-sm" data-testid="it-elg-parcial">
        <div className="font-semibold">Este país publica solo la marca de elegibilidad</div>
        <p>
          Su proceso de imputación todavía no está habilitado: la corrida calcula qué hogares son elegibles y publica
          esa marca, sin imputar ni reemplazar.
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-5">
      <div
        className="rounded-lg border px-4 py-3"
        style={{ borderColor: "color-mix(in oklch, var(--qf-wp-blue) 40%, transparent)", background: "color-mix(in oklch, var(--qf-wp-blue) 9%, transparent)" }}
        data-testid="it-revision"
      >
        <div className="font-semibold">Revisión antes de imputar</div>
        <p className="text-sm">
          Con estos parámetros se imputarían <strong>{num(resultado.revision.hogares_imputar)} hogares</strong>
          {resultado.revision.actos_imputar != null && ` (${num(resultado.revision.actos_imputar)} actos)`} en{" "}
          {resultado.revision.regiones_con_imputacion} regiones. Nada se escribe hasta aprobar.
        </p>
      </div>

      <Regiones regiones={resultado.regiones} cerradas={ajustes.regiones_cerradas} onAlternar={alternar} />

      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        <Seccion
          titulo={resultado.tendencia.length ? "Tendencia del % imputado" : "Contra lo publicado"}
          detalle={resultado.tendencia.length ? "Últimos cierres publicados y esta vuelta" : "Elegibles de esta vuelta contra los publicados del período"}
        >
          {resultado.tendencia.length > 0 && <Tendencia puntos={resultado.tendencia} />}
          {resultado.comparaciones.length === 0 && (
            <p className="text-sm text-muted-foreground">El período no tiene elegibilidad publicada para comparar.</p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {resultado.comparaciones.map((c) => (
              <div key={c.etiqueta} className="rounded-md bg-muted px-3 py-2">
                <div className="text-xs text-muted-foreground">{c.etiqueta}</div>
                <div
                  className="font-semibold tabular-nums"
                  style={Math.abs(c.delta_pp) > 1 ? textoTono(TONO.error) : undefined}
                >
                  {pp(c.delta_pp)}
                </div>
              </div>
            ))}
          </div>
        </Seccion>

        <Seccion titulo="Uso de donantes" detalle="Rep_Dons · cuántas veces se repite cada donante">
          <Donantes donantes={resultado.donantes} />
          <p className="text-xs text-muted-foreground">
            El detalle por hogar (Domicilios_Imput, Actos_Imput, Actos_Elim, ElgNat_Inconsist) se descarga al publicar.
          </p>
        </Seccion>
      </div>
    </div>
  )
}

// Primero lo que hay que revisar: déficit, justo y sin imputar; las OK al final.
const ORDEN: Record<RegionElegibilidad["estado"], number> = { deficit: 0, justo: 1, cerrada: 2, ok: 3 }
const FILTROS = ["deficit", "justo", "cerrada", "ok"] as const
type Filtro = "atencion" | "todas" | (typeof FILTROS)[number]
// escala de la barra hasta 120 %: la marca vertical es la muestra ideal (100 %)
const ESCALA = 1.2

function ordenar(regiones: RegionElegibilidad[]): string[] {
  return [...regiones]
    .sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || a.cumplimiento - b.cumplimiento)
    .map((r) => r.id)
}

function Regiones({ regiones, cerradas, onAlternar }: {
  regiones: RegionElegibilidad[]
  cerradas: string[]
  onAlternar: (r: RegionElegibilidad) => void
}) {
  const [filtro, setFiltroEstado] = useState<Filtro>("atencion")
  const [buscar, setBuscar] = useState("")
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set())
  // Regiones que el usuario excluyó o reabrió: siguen a la vista aunque su estado ya no calce
  // con el filtro, para que no "desaparezcan" al hacer clic.
  const [tocadas, setTocadas] = useState<Set<string>>(() => new Set())
  const setFiltro = (f: Filtro) => {
    setFiltroEstado(f)
    setTocadas(new Set())
  }
  const conteo = useMemo(() => {
    const c = { deficit: 0, justo: 0, cerrada: 0, ok: 0 }
    for (const r of regiones) c[r.estado] += 1
    return c
  }, [regiones])
  // El orden se fija al entrar al país o cambiar de filtro, no en cada vuelta: si excluir una
  // región la reordenara, las filas saltarían bajo el cursor.
  const clave = `${filtro}|${regiones.map((r) => r.id).sort().join(",")}`
  const [orden, setOrden] = useState(() => ({ clave, ids: ordenar(regiones) }))
  if (orden.clave !== clave) setOrden({ clave, ids: ordenar(regiones) })
  const porId = new Map(regiones.map((r) => [r.id, r]))
  const ordenadas = orden.ids.flatMap((id) => porId.get(id) ?? [])
  const q = buscar.trim().toLowerCase()
  // Al buscar se mira en todas las regiones, no solo en las del filtro.
  const filas = ordenadas.filter((r) =>
    q
      ? r.nombre.toLowerCase().includes(q)
      : filtro === "todas" ||
        tocadas.has(r.id) ||
        (filtro === "atencion" ? r.estado !== "ok" : r.estado === filtro),
  )
  const alternar = (r: RegionElegibilidad) => {
    setTocadas((s) => new Set(s).add(r.id))
    onAlternar(r)
  }
  const plegadas = !q && filtro === "atencion" ? conteo.ok : 0
  const conPublicado = regiones.some((r) => r.publicado != null)
  const alternarDetalle = (id: string) =>
    setAbiertas((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <Seccion
      ancla="iterar.regiones"
      titulo="Muestra por región contra la muestra ideal"
      detalle="La marca vertical es la muestra ideal (100 %): OK desde 100 %, justo desde 90 %. Primero las regiones que requieren atención."
    >
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar regiones por estado">
        {FILTROS.map((f) => {
          const on = filtro === f
          return (
            <button
              key={f}
              type="button"
              aria-pressed={on}
              disabled={conteo[f] === 0}
              onClick={() => setFiltro(on ? "atencion" : f)}
              data-testid={`it-filtro-${f}`}
              className={cn(
                "h-8 rounded-full border px-3 text-xs font-medium tabular-nums transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50",
                on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
              )}
            >
              <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: ESTADO[f].relleno }} aria-hidden />
              {conteo[f]} {ESTADO[f].plural}
            </button>
          )
        })}
        <button
          type="button"
          aria-pressed={filtro === "todas"}
          onClick={() => setFiltro(filtro === "todas" ? "atencion" : "todas")}
          className="h-8 px-2 text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
        >
          {filtro === "todas" ? "Solo las que requieren atención" : `Ver las ${regiones.length}`}
        </button>
        <Input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar región"
          aria-label="Buscar región"
          className="ml-auto h-8 max-w-56"
        />
      </div>

      {filas.length === 0 ? (
        q && (
          <p className="text-sm" role="status">
            Ninguna región coincide.
          </p>
        )
      ) : (
        <ul className="divide-y rounded-md border" data-testid="it-regiones">
          {filas.map((r) => (
            <FilaRegion
              key={r.id}
              r={r}
              abierta={abiertas.has(r.id)}
              conPublicado={conPublicado}
              onDetalle={() => alternarDetalle(r.id)}
              excluida={cerradas.includes(r.id)}
              onAlternar={() => alternar(r)}
            />
          ))}
        </ul>
      )}
      {plegadas > 0 && (
        <button
          type="button"
          onClick={() => setFiltro("todas")}
          className="w-full rounded-md border border-dashed px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent"
          data-testid="it-regiones-ok"
        >
          {filas.length === 0
            ? plegadas === 1 ? "La única región está OK" : `Las ${plegadas} regiones están OK`
            : plegadas === 1 ? "y 1 región OK" : `y ${plegadas} regiones OK`}{" "}
          · <span className="underline">ver</span>
        </button>
      )}
    </Seccion>
  )
}

function FilaRegion({ r, abierta, excluida, conPublicado, onDetalle, onAlternar }: {
  r: RegionElegibilidad
  abierta: boolean
  /** Excluida en los ajustes de esta vuelta (puede no estar calculado todavía). */
  excluida: boolean
  conPublicado: boolean
  onDetalle: () => void
  onAlternar: () => void
}) {
  const e = ESTADO[r.estado]
  // El resultado en pantalla puede ser de la vuelta anterior: se avisa qué cambia al calcular.
  const pendiente =
    excluida && r.estado !== "cerrada" ? "se excluye al calcular"
    : !excluida && r.estado === "cerrada" ? "se imputa al calcular"
    : null
  const detalle: [string, string][] = [
    ["Ideal", num(r.ideal)],
    ["Natural", num(r.natural)],
    ["Imputados", num(r.imputados)],
    ...(conPublicado ? ([["Reemplazos", num(r.reemplazos ?? 0)]] as [string, string][]) : []),
    ["Final", num(r.final)],
    ...(conPublicado
      ? ([[
          "Publicado",
          r.publicado == null
            ? "—"
            : `${num(r.publicado)}${r.publicado !== r.final ? ` (${r.final - r.publicado > 0 ? "+" : ""}${num(r.final - r.publicado)} esta vuelta)` : ""}`,
        ]] as [string, string][])
      : []),
  ]
  return (
    <li data-testid={`it-region-${r.id}`} className={cn(excluida && "bg-muted/50")}>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(96px,2fr)_auto_auto] items-center gap-3 px-3 py-2 sm:grid-cols-[minmax(0,10rem)_minmax(7rem,1fr)_6.5rem_auto]">
        <button
          type="button"
          onClick={onDetalle}
          aria-expanded={abierta}
          className="flex min-w-0 items-center gap-1.5 text-left text-sm font-medium hover:underline"
        >
          <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", abierta && "rotate-90")} aria-hidden />
          <span className="truncate">{r.nombre}</span>
        </button>
        <div className="flex items-center gap-2">
          <div className="relative h-2.5 flex-1 rounded-full bg-muted" aria-hidden>
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${Math.min(100, (r.cumplimiento / ESCALA) * 100)}%`, background: e.relleno }}
            />
            <div className="absolute -inset-y-1 w-0.5 bg-foreground" style={{ left: `${100 / ESCALA}%` }} />
          </div>
          <span className="w-12 text-right text-xs tabular-nums">{pct(r.cumplimiento, 0)}</span>
        </div>
        <span className="text-sm font-semibold leading-tight" style={textoTono(e.tono)}>
          {e.texto}
          {pendiente && <span className="block text-xs font-normal text-muted-foreground">{pendiente}</span>}
        </span>
        <Button
          variant={excluida ? "secondary" : "outline"}
          size="sm"
          className="min-w-[7.5rem] px-2"
          onClick={onAlternar}
          aria-pressed={excluida}
          aria-label={excluida ? `Volver a imputar en ${r.nombre}` : `No imputar en ${r.nombre}`}
          title={
            excluida
              ? "Vuelve a completar esta región con donantes en la próxima vuelta"
              : "Deja esta región solo con sus elegibles naturales, sin donantes, en la próxima vuelta"
          }
        >
          {excluida ? "Volver a imputar" : "No imputar"}
        </Button>
      </div>
      {abierta && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 px-9 pb-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
          {detalle.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  )
}

function Tendencia({ puntos }: { puntos: ResultadoElegibilidad["tendencia"] }) {
  if (puntos.length === 0) return null
  const W = 520
  const H = 160
  const max = Math.max(...puntos.map((p) => p.pct_imputado)) * 1.25 || 1
  const x = (i: number) => 24 + (i * (W - 48)) / Math.max(1, puntos.length - 1)
  const y = (v: number) => H - 24 - (v / max) * (H - 40)
  const linea = puntos.map((p, i) => `${x(i)},${y(p.pct_imputado)}`).join(" ")
  const actual = puntos.findIndex((p) => p.actual)
  const ultimo = puntos[puntos.length - 1]
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`% imputado de ${periodoLabel(puntos[0].periodo)} a ${periodoLabel(ultimo.periodo)}; esta vuelta ${pct(ultimo.pct_imputado)}`}
    >
      <line x1={24} x2={W - 24} y1={H - 24} y2={H - 24} stroke="var(--border)" />
      <polyline points={linea} fill="none" stroke="var(--qf-wp-blue)" strokeWidth={2.5} strokeLinejoin="round" />
      {actual >= 0 && (
        <>
          <circle cx={x(actual)} cy={y(puntos[actual].pct_imputado)} r={6} fill="var(--primary)" />
          <text x={x(actual)} y={y(puntos[actual].pct_imputado) - 12} textAnchor="end" fontSize={12} fill="var(--foreground)">
            {pct(puntos[actual].pct_imputado)}
          </text>
        </>
      )}
      <text x={24} y={H - 6} fontSize={11} fill="var(--muted-foreground)">
        {periodoLabel(puntos[0].periodo)}
      </text>
      <text x={W - 24} y={H - 6} fontSize={11} textAnchor="end" fill="var(--muted-foreground)">
        {periodoLabel(ultimo.periodo)}
      </text>
    </svg>
  )
}

function Donantes({ donantes }: { donantes: ResultadoElegibilidad["donantes"] }) {
  const max = Math.max(1, ...donantes.map((d) => d.hogares))
  return (
    <ul className="space-y-2">
      {donantes.map((d) => (
        <li key={d.usos} className="grid grid-cols-[80px_minmax(0,1fr)_64px] items-center gap-3 text-sm">
          <span>{d.usos === 1 ? "1 uso" : `${d.usos} usos`}</span>
          <div className="h-3 rounded bg-muted" aria-hidden>
            <div
              className="h-3 rounded"
              style={{ width: `${(d.hogares / max) * 100}%`, background: d.usos >= 4 ? "#f871a0" : "var(--qf-wp-blue)" }}
            />
          </div>
          <span className="text-right tabular-nums">{num(d.hogares)}</span>
        </li>
      ))}
    </ul>
  )
}

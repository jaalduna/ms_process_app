import { useMemo, useState } from "react"
import { AlertTriangle, ArrowLeft, Loader2, Rocket, Search, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useFlujoBases, useFlujoPeriodos } from "../../hooks/useQmsTrFlujo"
import { formatChile } from "../../time"
import type { EstadoBase, FlujoBase, FlujoPais, ModoTanda, TandaCreate } from "../../types"
import { mensajeError, periodoLabel } from "./formato"
import { bloqueo } from "./bloqueo"
import { ChipBase } from "./piezas"

/** Orden de la lista: primero las candidatas naturales (liberadas), al final las que no se pueden elegir. */
const PRIORIDAD: EstadoBase[] = ["pendiente", "revertida", "retenida", "sin_hito4", "aplicada", "bypass", "en_proceso", "fuera_de_alcance"]

const sinH4 = (b: FlujoBase) => !b.h4 || b.h4_anulado

const MODOS: { modo: ModoTanda; titulo: string; texto: string }[] = [
  { modo: "completo", titulo: "Completo", texto: "Corre, envía el zip a DQ con ticket y correo, verifica en J y registra el hito 10." },
  { modo: "solo_correr", titulo: "Solo correr", texto: "Solo la corrida en Databricks, para probar. Sin correo, ticket ni hito 10." },
]

interface OverrideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  paises: FlujoPais[]
  paisInicial: string
  periodoInicial: string
  lanzando: boolean
  onLanzar: (data: TandaCreate) => void
}

/** "Lanzar QMS-TR": país -> período -> bases -> modo y nota -> confirmación. */
export function OverrideDialog(props: OverrideDialogProps) {
  // el contenido se monta de nuevo cada vez que se abre: arranca limpio con el país/período de la vista
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <Contenido {...props} />}
    </Dialog>
  )
}

function Contenido({ paises, paisInicial, periodoInicial, lanzando, onLanzar }: OverrideDialogProps) {
  const [pais, setPais] = useState(paisInicial)
  const [periodoSel, setPeriodo] = useState(periodoInicial)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [q, setQ] = useState("")
  const [forzar, setForzar] = useState(false)
  const [modo, setModo] = useState<ModoTanda>("completo")
  const [nota, setNota] = useState("")
  const [revisar, setRevisar] = useState(false)

  const periodos = useFlujoPeriodos(pais)
  // sin período elegido (recién se cambió el país): el más reciente
  const periodo = periodoSel || periodos.data?.[0]?.periodo || ""
  const bases = useFlujoBases(pais, periodo, false)
  const lista = useMemo(() => bases.data ?? [], [bases.data])
  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase()
    return lista
      .filter((b) => !t || b.nombre.toLowerCase().includes(t) || String(b.producto).includes(t))
      .sort((a, b) => PRIORIDAD.indexOf(a.estado) - PRIORIDAD.indexOf(b.estado) || a.producto - b.producto)
  }, [lista, q])
  const liberadas = lista.filter((b) => b.estado === "pendiente")
  const elegidas = lista.filter((b) => sel.has(b.producto))
  const elegidasSinH4 = elegidas.filter(sinH4)
  const etiquetaPais = paises.find((p) => p.codigo === pais)?.etiqueta ?? pais
  const listo = elegidas.length > 0 && (elegidasSinH4.length === 0 || forzar)

  function cambiarPais(codigo: string) {
    setPais(codigo)
    setPeriodo("")
    setSel(new Set())
  }
  function cambiarPeriodo(p: string) {
    setPeriodo(p)
    setSel(new Set())
  }
  function alternar(p: number) {
    const s = new Set(sel)
    if (s.has(p)) s.delete(p)
    else s.add(p)
    setSel(s)
  }
  function lanzar() {
    onLanzar({ pais, periodo, productos: [...sel].sort((a, b) => a - b), modo, forzar: elegidasSinH4.length > 0 && forzar, nota: nota.trim() })
  }

  return (
    <DialogContent className="qf flex h-[min(92vh,780px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl" data-testid="qf-override">
      <DialogHeader className="border-b px-6 pt-6 pb-4">
        <DialogTitle className="flex items-center gap-2 font-display text-xl">
          <Rocket className="size-5 text-primary" /> {revisar ? "Revisa antes de lanzar" : "Lanzar QMS-TR"}
        </DialogTitle>
        <DialogDescription>
          {revisar
            ? "Así va a quedar la tanda manual. Entra al mismo flujo que una liberación."
            : "Elige el país, el período productivo y las bases. Las liberadas sin tanda son las candidatas naturales."}
        </DialogDescription>
      </DialogHeader>

      {!revisar ? (
        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:overflow-hidden">
          <div className="flex min-h-0 flex-col gap-5 px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">País</legend>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" data-testid="qf-override-pais">
                {paises.map((p) => (
                  <button
                    key={p.codigo} type="button" role="radio" aria-checked={pais === p.codigo}
                    onClick={() => cambiarPais(p.codigo)}
                    className={cn(
                      "rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-colors",
                      pais === p.codigo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                    )}
                  >
                    {p.etiqueta}
                  </button>
                ))}
              </div>
            </fieldset>
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="qf-override-periodo">Período productivo</label>
              <Select value={periodo} onValueChange={cambiarPeriodo}>
                <SelectTrigger id="qf-override-periodo" className="w-full" data-testid="qf-override-periodo">
                  <SelectValue placeholder={periodos.isLoading ? "Cargando…" : "Elige un período"} />
                </SelectTrigger>
                <SelectContent>
                  {(periodos.data ?? []).map((p) => (
                    <SelectItem key={p.periodo} value={p.periodo}>
                      <span className="first-letter:uppercase">{periodoLabel(p.periodo)}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{p.h4} con hito 4</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Bases</span>
              <span className="text-xs text-muted-foreground tabular-nums">{sel.size} {sel.size === 1 ? "elegida" : "elegidas"}</span>
              <div className="ml-auto flex gap-1.5">
                <Button type="button" size="sm" variant="secondary" disabled={liberadas.length === 0}
                  onClick={() => setSel(new Set([...sel, ...liberadas.map((b) => b.producto)]))} data-testid="qf-override-liberadas">
                  <Sparkles /> Elegir liberadas ({liberadas.length})
                </Button>
                {sel.size > 0 && <Button type="button" size="sm" variant="ghost" onClick={() => setSel(new Set())}>Limpiar</Button>}
              </div>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o código"
                className="pl-8" aria-label="Buscar bases" data-testid="qf-override-buscar" />
            </div>
            <div className="min-h-48 max-h-80 flex-1 overflow-y-auto rounded-xl border bg-card lg:max-h-none" data-testid="qf-override-bases">
              {periodos.error ? (
                <p role="alert" className="p-4 text-sm text-destructive">No se pudieron leer los períodos de {etiquetaPais}: {mensajeError(periodos.error)}</p>
              ) : periodos.data && periodos.data.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">{etiquetaPais} no tiene períodos con hitos todavía.</p>
              ) : bases.isLoading || !periodo ? (
                <div className="space-y-2 p-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : bases.error ? (
                <p role="alert" className="p-4 text-sm text-destructive">No se pudieron leer las bases de {etiquetaPais} {periodo}: {mensajeError(bases.error)}</p>
              ) : filtradas.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">Ninguna base coincide con “{q}”.</p>
              ) : (
                <ul className="divide-y">
                  {filtradas.map((b) => {
                    const motivo = bloqueo(b)
                    const id = `qf-ov-${b.producto}`
                    return (
                      <li key={b.producto} className={cn("flex items-center gap-3 px-3 py-2", motivo ? "opacity-55" : "hover:bg-muted/50",
                        sel.has(b.producto) && "bg-[color-mix(in_oklch,var(--primary)_7%,transparent)]")}>
                        <Checkbox id={id} checked={sel.has(b.producto)} disabled={!!motivo} onCheckedChange={() => alternar(b.producto)}
                          data-testid={`qf-override-base-${b.producto}`} aria-describedby={motivo ? `${id}-m` : undefined} />
                        <label htmlFor={id} className={cn("min-w-0 flex-1 text-sm", !motivo && "cursor-pointer")}>
                          <span className="mr-2 text-xs text-muted-foreground tabular-nums">{b.producto}</span>
                          <span className="font-medium">{b.nombre}</span>
                          <span id={`${id}-m`} className="block text-xs text-muted-foreground">
                            {motivo ?? (sinH4(b) ? (b.h4_anulado ? "Hito 4 anulado" : "Sin hito 4") : `Hito 4 ${formatChile(b.h4!)}`)}
                          </span>
                        </label>
                        <ChipBase estado={b.estado} />
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>

          </div>
          <div className="flex flex-col gap-5 border-t bg-muted/25 px-6 py-5 lg:overflow-y-auto lg:border-t-0 lg:border-l">
          {elegidasSinH4.length > 0 && (
            <div className="rounded-xl border border-[color-mix(in_oklch,var(--qf-retenida)_45%,transparent)] bg-[color-mix(in_oklch,var(--qf-retenida)_12%,transparent)] p-3.5" data-testid="qf-override-advertencia">
              <p className="flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[color-mix(in_oklch,var(--qf-retenida)_60%,var(--foreground))]" />
                <span>
                  {elegidasSinH4.length === 1 ? "Una base elegida no tiene" : `${elegidasSinH4.length} bases elegidas no tienen`} hito 4
                  vigente ({elegidasSinH4.map((b) => b.nombre).join(", ")}). DC todavía no las libera: si las corres igual, quedará anotado en la bitácora.
                </span>
              </p>
              <label className="mt-2.5 ml-6 flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={forzar} onCheckedChange={(v) => setForzar(v === true)} data-testid="qf-override-forzar" />
                Forzar la corrida sin hito 4
              </label>
            </div>
          )}

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Modo</legend>
            <div className="grid gap-2" role="radiogroup">
              {MODOS.map((m) => (
                <button key={m.modo} type="button" role="radio" aria-checked={modo === m.modo} onClick={() => setModo(m.modo)}
                  data-testid={`qf-override-modo-${m.modo}`}
                  className={cn("rounded-xl border p-3 text-left transition-colors",
                    modo === m.modo ? "border-primary ring-1 ring-primary bg-[color-mix(in_oklch,var(--primary)_6%,transparent)]" : "hover:bg-muted/60")}>
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span className={cn("grid size-4 place-items-center rounded-full border-2", modo === m.modo ? "border-primary" : "border-muted-foreground/40")}>
                      {modo === m.modo && <span className="size-1.5 rounded-full bg-primary" />}
                    </span>
                    {m.titulo}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{m.texto}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="qf-override-nota" className="mb-1.5 block text-sm font-medium">
              Nota <span className="font-normal text-muted-foreground">(opcional, queda en la bitácora)</span>
            </label>
            <Textarea id="qf-override-nota" value={nota} onChange={(e) => setNota(e.target.value)} rows={2}
              placeholder="Ej.: DC re-liberó Café molido por correo" data-testid="qf-override-nota" />
          </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5" data-testid="qf-override-resumen">
          <div className="rounded-xl bg-[var(--qf-island)] p-5 text-white">
            <p className="text-sm text-white/70">Vas a lanzar</p>
            <p className="font-display text-3xl font-semibold">
              {elegidas.length} {elegidas.length === 1 ? "base" : "bases"}
            </p>
            <p className="mt-1 text-white/85">
              de {etiquetaPais}, <span className="first-letter:uppercase">{periodoLabel(periodo)}</span>, en modo {modo === "completo" ? "completo" : "solo correr"}.
            </p>
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {elegidas.map((b) => (
              <li key={b.producto} className={cn("rounded-md border px-2 py-0.5 text-xs", sinH4(b) && "border-[var(--qf-retenida)]")}>
                <span className="text-muted-foreground tabular-nums">{b.producto}</span> {b.nombre}
              </li>
            ))}
          </ul>
          {elegidasSinH4.length > 0 && (
            <p className="flex items-center gap-2 text-sm"><AlertTriangle className="size-4 text-[var(--qf-retenida)]" />
              Forzada: {elegidasSinH4.length} sin hito 4.</p>
          )}
          {nota.trim() && <p className="text-sm"><span className="text-muted-foreground">Nota:</span> {nota.trim()}</p>}
          <p className="text-sm text-muted-foreground">
            {modo === "completo"
              ? "Cuando termine la corrida se envía el zip a DQ, se crea el ticket y se manda el correo de resultados."
              : "Al terminar la corrida la tanda se cierra sola: no se envía nada a DQ."}
          </p>
        </div>
      )}

      <DialogFooter className="items-center border-t bg-muted/30 px-6 py-3.5 sm:justify-between">
        <span className="hidden text-xs text-muted-foreground sm:block">
          {revisar ? "Puedes volver y cambiar lo que quieras." : listo ? "Todo listo para revisar." : elegidas.length === 0 ? "Elige al menos una base." : "Marca “forzar” para seguir."}
        </span>
        {revisar ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setRevisar(false)} disabled={lanzando}><ArrowLeft /> Volver</Button>
            <Button onClick={lanzar} disabled={lanzando} data-testid="qf-override-confirmar">
              {lanzando ? <Loader2 className="animate-spin" /> : <Rocket />} Lanzar QMS-TR
            </Button>
          </div>
        ) : (
          <Button onClick={() => setRevisar(true)} disabled={!listo} data-testid="qf-override-revisar">
            Revisar {elegidas.length > 0 ? `${elegidas.length} ${elegidas.length === 1 ? "base" : "bases"}` : ""}
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  )
}

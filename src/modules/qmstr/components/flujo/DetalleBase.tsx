import { useState } from "react"
import { AlertTriangle, ArrowRight, History, Loader2, Rocket, Ticket } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { formatChile } from "../../time"
import { ESTADO_TANDA_LABEL, TIPO_TANDA_LABEL, ayudaEstadoBase, type Entrega, type FlujoBase, type ModoTanda, type TandaCreate } from "../../types"
import { bloqueo } from "./bloqueo"
import { periodoLabel } from "./formato"
import { modosDe } from "./modos"
import { Chip, ChipBase } from "./piezas"

interface DetalleBaseProps {
  base: FlujoBase | null
  pais: string
  paisEtiqueta: string
  periodo: string
  puedeOperar: boolean
  lanzando: boolean
  onOpenChange: (open: boolean) => void
  onLanzar: (data: TandaCreate) => void
  onVerTanda: (numero: number) => void
  /** Cómo entrega el flujo: con PythonCac no hay ticket ni hito 10. */
  entrega?: Entrega
}

/** Detalle de una base al hacer clic en su celda del tablero: estado, hitos, tanda actual, historial y lanzarla sola. */
export function DetalleBase(props: DetalleBaseProps) {
  return (
    <Sheet open={props.base !== null} onOpenChange={props.onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md" data-testid="qf-detalle">
        {/* se monta de nuevo por base: el formulario de lanzamiento arranca limpio */}
        {props.base && <Contenido key={props.base.producto} {...props} base={props.base} />}
      </SheetContent>
    </Sheet>
  )
}

function Hito({ label, at, anulado }: { label: string; at: string | null; anulado?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-right tabular-nums", !at && "text-muted-foreground")}>
        {at ? formatChile(at) : "—"}
        {anulado && <span className="ml-1.5 text-xs text-destructive">anulado</span>}
      </dd>
    </div>
  )
}

function Contenido({ base: b, pais, paisEtiqueta, periodo, puedeOperar, lanzando, onLanzar, onVerTanda, entrega = "ticket" }: DetalleBaseProps & { base: FlujoBase }) {
  const directo = entrega === "pythoncac"
  const [modo, setModo] = useState<ModoTanda>("completo")
  const [nota, setNota] = useState("")
  const [forzar, setForzar] = useState(false)
  // con PythonCac QMS-TR va antes de la liberación metodológica: no se exige hito 4
  const sinH4 = !directo && (!b.h4 || b.h4_anulado)
  const motivo = bloqueo(b, modo)
  const listo = !motivo && (!sinH4 || forzar)
  const historial = [...b.historial].reverse()

  return (
    <>
      <SheetHeader className="border-b pr-10">
        <SheetTitle className="font-display text-xl">
          <span className="text-muted-foreground tabular-nums">{b.producto}</span> {b.nombre}
        </SheetTitle>
        <SheetDescription className="first-letter:uppercase">{paisEtiqueta}, {periodoLabel(periodo)}</SheetDescription>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <ChipBase estado={b.estado} tandaEstado={b.tanda_estado} entrega={entrega} />
          {b.jira_key && <Chip tone="var(--qf-pendiente)" className="font-semibold"><Ticket className="size-3" />{b.jira_key}</Chip>}
        </div>
        <p className="text-sm text-muted-foreground">{ayudaEstadoBase(b.estado, entrega)}</p>
      </SheetHeader>

      <div className="space-y-6 p-4">
        {(b.motivo_bypass || b.revisar) && (
          <div className="space-y-2" data-testid="qf-detalle-motivos">
            {b.motivo_bypass && (
              <p className="rounded-lg border border-dashed px-3 py-2 text-sm">
                <span className="font-medium">Sin ajustes:</span> {b.motivo_bypass}
              </p>
            )}
            {b.revisar && (
              <p className="flex gap-2 rounded-lg border border-[var(--qf-retenida)] bg-[color-mix(in_oklch,var(--qf-retenida)_8%,transparent)] px-3 py-2 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--qf-retenida)]" />
                <span><span className="font-medium">{directo ? "Observada antes de aplicar:" : "Observada antes del ticket:"}</span> {b.revisar}</span>
              </p>
            )}
          </div>
        )}

        <section aria-label="Hitos">
          <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Hitos</h3>
          <dl className="divide-y">
            <Hito label={directo ? "Distribución de actos (hito 3)" : "Distribución de DC (hito 3)"} at={b.h3} />
            {/* con entrega directa la liberación metodológica viene después de QMS-TR: no se muestra */}
            {!directo && <Hito label="Liberación de DC (hito 4)" at={b.h4} anulado={b.h4_anulado} />}
            {!directo && <Hito label="QMS-TR (hito 10)" at={b.h10} />}
          </dl>
        </section>

        {b.tanda_numero !== null && b.tanda_estado && (
          <section aria-label="Tanda actual" className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5">
            <div className="text-sm">
              <p className="font-medium">Tanda {b.tanda_numero}</p>
              <p className="text-muted-foreground">{ESTADO_TANDA_LABEL[b.tanda_estado]}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => onVerTanda(b.tanda_numero!)} data-testid="qf-detalle-ver-tanda">
              Ver tanda <ArrowRight />
            </Button>
          </section>
        )}

        <section aria-label="Historial">
          <h3 className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <History className="size-3.5" /> Historial en QMS-TR
          </h3>
          {historial.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="qf-detalle-sin-historial">Todavía no pasa por ninguna tanda.</p>
          ) : (
            <ol className="relative space-y-3 border-l border-border pl-5" data-testid="qf-detalle-historial">
              {historial.map((e) => (
                <li key={e.tanda_id} className="relative">
                  <span aria-hidden className="absolute top-1.5 -left-[25px] size-2.5 rounded-full bg-primary ring-4 ring-background" />
                  <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="font-semibold">{TIPO_TANDA_LABEL[e.tipo]}</span>
                    <time className="text-muted-foreground tabular-nums" dateTime={e.at}>{formatChile(e.at)}</time>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{e.evento}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        {puedeOperar && (
          <section aria-label="Lanzar esta base" className="space-y-3 rounded-xl border bg-muted/25 p-4" data-testid="qf-detalle-lanzar">
            <h3 className="font-display text-base font-semibold">Correr solo esta base</h3>
            {/* con entrega directa DC no elige modo: siempre corre, valida y aplica */}
            {!directo && <div className="grid gap-2" role="radiogroup" aria-label="Modo">
              {modosDe(entrega).map((m) => (
                <button key={m.modo} type="button" role="radio" aria-checked={modo === m.modo} onClick={() => setModo(m.modo)}
                  data-testid={`qf-detalle-modo-${m.modo}`}
                  className={cn("rounded-lg border bg-card p-2.5 text-left transition-colors",
                    modo === m.modo ? "border-primary ring-1 ring-primary" : "hover:bg-muted/60")}>
                  <span className="text-sm font-semibold">{m.titulo}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{m.texto}</span>
                </button>
              ))}
            </div>}
            {sinH4 && !motivo && (
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={forzar} onCheckedChange={(v) => setForzar(v === true)} className="mt-0.5" data-testid="qf-detalle-forzar" />
                <span>DC todavía no la libera (sin hito 4 vigente). <span className="font-medium">Correrla igual</span>; queda anotado en la bitácora.</span>
              </label>
            )}
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="Nota (opcional): por qué la corres a mano"
              aria-label="Nota del lanzamiento" data-testid="qf-detalle-nota" />
            {motivo && <p className="text-sm text-muted-foreground" data-testid="qf-detalle-bloqueo">{motivo}.</p>}
            <Button className="w-full" disabled={!listo || lanzando} data-testid="qf-detalle-lanzar-btn"
              onClick={() => onLanzar({ pais, periodo, productos: [b.producto], modo, forzar: sinH4 && forzar, nota: nota.trim() })}>
              {lanzando ? <Loader2 className="animate-spin" /> : <Rocket />}
              {modo === "completo" ? "Correr QMS-TR en esta base" : "Solo correr esta base"}
            </Button>
          </section>
        )}
      </div>
    </>
  )
}

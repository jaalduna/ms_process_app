import { useState } from "react"
import { AlertTriangle, ArrowLeft, Loader2, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useBloqueosReversion } from "../../hooks/useQmsTrFlujo"
import type { Entrega, Tanda } from "../../types"
import { avisoBloqueo, mensajeError, nBases } from "./formato"

interface RevertirDialogProps {
  tanda: Tanda | null
  /** Bases de la tanda que ya tienen una reversión (no se pueden volver a revertir). */
  yaRevertidas: Set<number>
  nombres: Map<number, string>
  revirtiendo: boolean
  /** Cómo entrega el flujo: con PythonCac la reversión se aplica directo en J. */
  entrega?: Entrega
  onOpenChange: (open: boolean) => void
  onRevertir: (productos: number[], motivo: string, confirmarCambiosPosteriores: boolean) => void
  /** Revertir solo esta base (desde su detalle): el diálogo la trae elegida y no muestra las demás de la tanda. */
  soloBase?: number | null
}

/**
 * Revertir bases de una tanda cerrada: elegir bases + motivo, y confirmar. Si J cambió después de QMS-TR en una base
 * (DC, cuestionamientos, reglas de MKA), la reversión pisa esos cambios: se avisa y hay que confirmarlo.
 */
export function RevertirDialog(props: RevertirDialogProps) {
  return (
    <Dialog open={props.tanda !== null} onOpenChange={props.onOpenChange}>
      {props.tanda && <Contenido {...props} tanda={props.tanda} />}
    </Dialog>
  )
}

function Contenido({ tanda, yaRevertidas, nombres, revirtiendo, onRevertir, entrega = "ticket", soloBase = null }: RevertirDialogProps & { tanda: Tanda }) {
  const [sel, setSel] = useState<Set<number>>(new Set(soloBase !== null ? [soloBase] : []))
  const [motivo, setMotivo] = useState("")
  const [confirmar, setConfirmar] = useState(false)
  const [aceptaPisar, setAceptaPisar] = useState(false)
  const bloqueos = useBloqueosReversion(tanda.id)
  const bloqueadas = bloqueos.data ?? {}
  const revisado = bloqueos.isSuccess
  const candidatas = tanda.productos.filter((p) => !tanda.bypass.includes(p) && (soloBase === null || p === soloBase))
  const nConCambios = candidatas.filter((p) => String(p) in bloqueadas).length
  const elegidas = candidatas.filter((p) => sel.has(p))
  const pisadas = elegidas.filter((p) => String(p) in bloqueadas)
  const cambiosPisados = pisadas.reduce((n, p) => n + bloqueadas[String(p)].cambios, 0)
  const listo = revisado && elegidas.length > 0 && motivo.trim().length > 0

  function alternar(p: number) {
    const s = new Set(sel)
    if (s.has(p)) s.delete(p)
    else s.add(p)
    setSel(s)
  }

  return (
    <DialogContent className="qf flex max-h-[min(90vh,760px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl" data-testid="qf-revertir">
      <DialogHeader className="border-b px-6 pt-6 pb-4">
        <DialogTitle className="flex items-center gap-2 font-display text-xl">
          <Undo2 className="size-5 text-[var(--qf-revertida)]" />
          {soloBase !== null
            ? <>Revertir {soloBase} {nombres.get(soloBase) ?? ""}</>
            : <>Revertir bases de la tanda {tanda.numero}</>}
        </DialogTitle>
        <DialogDescription>
          {entrega === "pythoncac"
            ? "El aplicativo QMS-TR devuelve en J los valores previos a QMS-TR y da de baja los actos que creó."
            : "Se arma un zip inverso con los valores de J previos a la corrida y va a DQ igual que una tanda. La liberación QMS-TR (hito 10) de esas bases se anula."}
        </DialogDescription>
      </DialogHeader>

      {!confirmar ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{soloBase !== null ? `Base aplicada en la tanda ${tanda.numero}` : entrega === "pythoncac" ? "Bases aplicadas" : "Bases del zip"}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{elegidas.length} {elegidas.length === 1 ? "elegida" : "elegidas"}</span>
          </div>
          {bloqueos.isPending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="qf-revertir-revisando">
              <Loader2 className="size-4 animate-spin" /> Revisando en la auditoría de J si hubo cambios después de QMS-TR…
            </p>
          )}
          {bloqueos.isError && (
            <p className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm" data-testid="qf-revertir-error-bloqueos">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>No se pudo revisar la auditoría de J ({mensajeError(bloqueos.error)}). Sin esa revisión no se puede revertir.</span>
            </p>
          )}
          {nConCambios > 0 && (
            <div className="rounded-xl border border-[color-mix(in_oklch,var(--qf-retenida)_45%,transparent)] bg-[color-mix(in_oklch,var(--qf-retenida)_12%,transparent)] p-3.5" data-testid="qf-revertir-aviso-bloqueo">
              <p className="flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[color-mix(in_oklch,var(--qf-retenida)_60%,var(--foreground))]" />
                <span>
                  {nConCambios === 1 ? "Una base tuvo" : `${nBases(nConCambios)} tuvieron`} cambios en J después de QMS-TR sobre sus
                  actos (DC, cuestionamientos o reglas de MKA). Si la reviertes, esos cambios se pierden: la base vuelve entera a como
                  estaba antes de QMS-TR.
                </span>
              </p>
            </div>
          )}
          <ul className="max-h-64 divide-y overflow-y-auto rounded-xl border" data-testid="qf-revertir-bases">
            {candidatas.map((p) => {
              const hecha = yaRevertidas.has(p)
              const bloqueo = bloqueadas[String(p)]
              const id = `qf-rev-${p}`
              return (
                <li key={p} className={cn("flex items-start gap-3 px-3 py-2", (hecha || bloqueo) && "opacity-70")}>
                  <Checkbox id={id} className="mt-0.5" checked={sel.has(p)} disabled={hecha || !revisado}
                    onCheckedChange={() => alternar(p)} data-testid={`qf-revertir-base-${p}`} />
                  <label htmlFor={id} className="flex-1 text-sm">
                    <span className="mr-2 text-xs text-muted-foreground tabular-nums">{p}</span>
                    {nombres.get(p) ?? ""}
                    {hecha && <span className="ml-2 text-xs text-muted-foreground">ya revertida</span>}
                    {bloqueo && (
                      <span className="mt-0.5 flex items-start gap-1.5 text-xs text-[color-mix(in_oklch,var(--qf-retenida)_60%,var(--foreground))]" data-testid={`qf-revertir-bloqueo-${p}`}>
                        <AlertTriangle className="mt-px size-3 shrink-0" /> {avisoBloqueo(bloqueo)}: se pierden si la reviertes
                      </span>
                    )}
                  </label>
                </li>
              )
            })}
          </ul>
          <div>
            <label htmlFor="qf-revertir-motivo" className="mb-1.5 block text-sm font-medium">Motivo</label>
            <Textarea id="qf-revertir-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2}
              placeholder="Ej.: Pedido de DC por correo 08/10" data-testid="qf-revertir-motivo" />
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5" data-testid="qf-revertir-resumen">
          <p className="text-base">
            Vas a revertir <strong>{elegidas.length} {elegidas.length === 1 ? "base" : "bases"}</strong> de la tanda {tanda.numero}:
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {elegidas.map((p) => (
              <li key={p} className="rounded-md border border-[var(--qf-revertida)] px-2 py-0.5 text-xs">{p} {nombres.get(p)}</li>
            ))}
          </ul>
          <p className="text-sm"><span className="text-muted-foreground">Motivo:</span> {motivo.trim()}</p>
          {pisadas.length > 0 && (
            <label className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm" data-testid="qf-revertir-pisar">
              <Checkbox className="mt-0.5" checked={aceptaPisar} onCheckedChange={(v) => setAceptaPisar(v === true)} data-testid="qf-revertir-aceptar-pisar" />
              <span>
                Entiendo que se van a deshacer <strong>{cambiosPisados.toLocaleString("es-CL")} {cambiosPisados === 1 ? "cambio" : "cambios"}</strong>{" "}
                {cambiosPisados === 1 ? "hecho" : "hechos"} en J después de QMS-TR
                en {pisadas.length === 1 ? "la base" : `${nBases(pisadas.length)}:`} {pisadas.join(", ")}. Quedan registrados en la tanda de
                reversión para volver a aplicarlos si hace falta.
              </span>
            </label>
          )}
        </div>
      )}

      <DialogFooter className="border-t bg-muted/30 px-6 py-3.5">
        {confirmar ? (
          <>
            <Button variant="outline" onClick={() => { setConfirmar(false); setAceptaPisar(false) }} disabled={revirtiendo}><ArrowLeft /> Volver</Button>
            <Button variant="destructive" onClick={() => onRevertir(elegidas, motivo.trim(), pisadas.length > 0)}
              disabled={revirtiendo || (pisadas.length > 0 && !aceptaPisar)} data-testid="qf-revertir-confirmar">
              {revirtiendo ? <Loader2 className="animate-spin" /> : <Undo2 />} Revertir {elegidas.length} {elegidas.length === 1 ? "base" : "bases"}
            </Button>
          </>
        ) : (
          <Button onClick={() => setConfirmar(true)} disabled={!listo} data-testid="qf-revertir-revisar">Revisar reversión</Button>
        )}
      </DialogFooter>
    </DialogContent>
  )
}

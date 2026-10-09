import { useState } from "react"
import { ArrowLeft, Loader2, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { Tanda } from "../../types"

interface RevertirDialogProps {
  tanda: Tanda | null
  /** Bases de la tanda que ya tienen una reversión (no se pueden volver a revertir). */
  yaRevertidas: Set<number>
  nombres: Map<number, string>
  revirtiendo: boolean
  onOpenChange: (open: boolean) => void
  onRevertir: (productos: number[], motivo: string) => void
}

/** Revertir bases de una tanda cerrada: elegir bases + motivo, y confirmar. */
export function RevertirDialog(props: RevertirDialogProps) {
  return (
    <Dialog open={props.tanda !== null} onOpenChange={props.onOpenChange}>
      {props.tanda && <Contenido {...props} tanda={props.tanda} />}
    </Dialog>
  )
}

function Contenido({ tanda, yaRevertidas, nombres, revirtiendo, onRevertir }: RevertirDialogProps & { tanda: Tanda }) {
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [motivo, setMotivo] = useState("")
  const [confirmar, setConfirmar] = useState(false)
  const candidatas = tanda.productos.filter((p) => !tanda.bypass.includes(p))
  const elegidas = candidatas.filter((p) => sel.has(p))
  const listo = elegidas.length > 0 && motivo.trim().length > 0

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
          <Undo2 className="size-5 text-[var(--qf-revertida)]" /> Revertir bases de la tanda {tanda.numero}
        </DialogTitle>
        <DialogDescription>
          Se arma un zip inverso con los valores de J previos a la corrida y va a DQ igual que una tanda. El hito 10 de
          esas bases se anula.
        </DialogDescription>
      </DialogHeader>

      {!confirmar ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">Bases del zip</span>
            <span className="text-xs text-muted-foreground tabular-nums">{elegidas.length} elegidas</span>
          </div>
          <ul className="max-h-64 divide-y overflow-y-auto rounded-xl border" data-testid="qf-revertir-bases">
            {candidatas.map((p) => {
              const hecha = yaRevertidas.has(p)
              const id = `qf-rev-${p}`
              return (
                <li key={p} className={cn("flex items-center gap-3 px-3 py-2", hecha && "opacity-55")}>
                  <Checkbox id={id} checked={sel.has(p)} disabled={hecha} onCheckedChange={() => alternar(p)} data-testid={`qf-revertir-base-${p}`} />
                  <label htmlFor={id} className="flex-1 text-sm">
                    <span className="mr-2 text-xs text-muted-foreground tabular-nums">{p}</span>
                    {nombres.get(p) ?? ""}
                    {hecha && <span className="ml-2 text-xs text-muted-foreground">ya revertida</span>}
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
        </div>
      )}

      <DialogFooter className="border-t bg-muted/30 px-6 py-3.5">
        {confirmar ? (
          <>
            <Button variant="outline" onClick={() => setConfirmar(false)} disabled={revirtiendo}><ArrowLeft /> Volver</Button>
            <Button variant="destructive" onClick={() => onRevertir(elegidas, motivo.trim())} disabled={revirtiendo} data-testid="qf-revertir-confirmar">
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

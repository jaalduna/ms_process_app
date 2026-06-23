import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CheckCircle2, XCircle, AlertTriangle, ArrowRight } from "lucide-react"
import type { DiffEntry, ValidationIssue } from "../mockData"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** what is being published, e.g. "IdPeso_Config · Chile" */
  target: string
  issues: ValidationIssue[]
  diff: DiffEntry[]
  /** called when the user confirms a clean publish */
  onPublish: () => void
}

/**
 * The trust gate. Before anything is written, the user sees:
 *   1. a validation checklist (errors block, warnings allow-with-ack),
 *   2. the exact before→after diff of every changed cell,
 *   3. a summary line.
 * Publish is disabled while any error exists — answering "how do I know it's correct?".
 */
export function ReviewPublishDialog({ open, onOpenChange, target, issues, diff, onPublish }: Props) {
  const errors = issues.filter(i => i.severity === "error")
  const warnings = issues.filter(i => i.severity === "warning")
  const blocked = errors.length > 0
  const noChanges = diff.length === 0

  const handlePublish = () => {
    onPublish()
    onOpenChange(false)
    toast.success(`Publicado: ${target}`, {
      description: `${diff.length} cambio(s) escritos al parquet. (mockup — sin escritura real)`,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Revisar y publicar — {target}</DialogTitle>
          <DialogDescription>
            Nada se escribe hasta que confirmes. Las validaciones con error bloquean la publicación.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
          {/* 1. Validation checklist */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium">Validación</h3>
              {blocked ? (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="h-3 w-3" />
                  {errors.length} error{errors.length !== 1 && "es"}
                </Badge>
              ) : (
                <Badge className="gap-1 bg-emerald-600 text-white">
                  <CheckCircle2 className="h-3 w-3" />
                  Sin errores
                </Badge>
              )}
              {warnings.length > 0 && (
                <Badge variant="outline" className="gap-1 text-amber-600">
                  <AlertTriangle className="h-3 w-3" />
                  {warnings.length} advertencia{warnings.length !== 1 && "s"}
                </Badge>
              )}
            </div>

            {issues.length === 0 ? (
              <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Todas las reglas pasaron: tipos correctos, sin duplicados y los estratos cuadran con el TOTAL en cada período.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {issues.map((i, idx) => (
                  <li
                    key={idx}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                      i.severity === "error"
                        ? "border-destructive/30 bg-destructive/5 text-destructive"
                        : "border-amber-300/40 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                    }`}
                  >
                    {i.severity === "error" ? (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <span>
                      <span className="font-mono text-xs font-medium">{i.location}</span> — {i.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 2. Diff */}
          <section className="space-y-2">
            <h3 className="text-sm font-medium">
              Cambios{" "}
              <span className="font-normal text-muted-foreground">
                ({diff.length} celda{diff.length !== 1 && "s"})
              </span>
            </h3>
            {noChanges ? (
              <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                No hay cambios respecto a la versión publicada.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2.5">Ubicación</th>
                      <th className="px-4 py-2.5">Antes</th>
                      <th className="px-4 py-2.5"></th>
                      <th className="px-4 py-2.5">Después</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.map((d, idx) => (
                      <tr key={idx} className="border-b last:border-0">
                        <td className="px-4 py-2 font-mono text-xs">{d.location}</td>
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground line-through">
                          {d.before}
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">
                          <ArrowRight className="h-3.5 w-3.5" />
                        </td>
                        <td className="px-4 py-2 font-mono text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          {d.after}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {blocked
              ? "Corrige los errores para habilitar la publicación."
              : warnings.length > 0
                ? "Hay advertencias; revísalas antes de continuar."
                : "Listo para publicar."}
          </span>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button disabled={blocked || noChanges} onClick={handlePublish}>
              {blocked ? "Bloqueado" : "Confirmar y publicar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

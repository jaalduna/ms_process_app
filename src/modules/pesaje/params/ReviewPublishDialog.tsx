import { useEffect, useRef, useState } from "react"
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
import { CheckCircle2, XCircle, AlertTriangle, ArrowRight, Loader2 } from "lucide-react"
import type { DiffEntry, ValidationIssue } from "./validation"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** what is being published, e.g. "IdPeso_Config · Chile" */
  target: string
  /** live client-side validation issues */
  issues: ValidationIssue[]
  diff: DiffEntry[]
  /** confirm a clean publish — async (calls the real publish endpoint). */
  onPublish: () => Promise<void>
  /** server-side validate (JAA-578). Runs when the dialog opens; its structured
   *  errors are merged inline as the authoritative backstop. */
  onValidate?: () => Promise<ValidationIssue[]>
}

/**
 * The trust gate. Before anything is written, the user sees the validation
 * checklist (client live + server authoritative errors), the before→after diff,
 * and a summary. Publish is disabled while any error exists, and the confirm
 * calls the real publish endpoint.
 */
export function ReviewPublishDialog({ open, onOpenChange, target, issues, diff, onPublish, onValidate }: Props) {
  const [publishing, setPublishing] = useState(false)
  const [validating, setValidating] = useState(false)
  const [serverIssues, setServerIssues] = useState<ValidationIssue[]>([])

  // Keep the latest validate callback in a ref so the effect can depend only on
  // `open` — an inline `onValidate` from the parent would otherwise re-trigger
  // the effect every render and loop.
  const validateRef = useRef(onValidate)
  validateRef.current = onValidate

  // Run server validation whenever the dialog opens.
  useEffect(() => {
    const validate = validateRef.current
    if (!open || !validate) {
      setServerIssues([])
      return
    }
    let cancelled = false
    setValidating(true)
    validate()
      .then((res) => {
        if (!cancelled) setServerIssues(res)
      })
      .catch(() => {
        if (!cancelled) setServerIssues([])
      })
      .finally(() => {
        if (!cancelled) setValidating(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const allIssues = [...issues, ...serverIssues]
  const errors = allIssues.filter((i) => i.severity === "error")
  const warnings = allIssues.filter((i) => i.severity === "warning")
  const blocked = errors.length > 0
  const noChanges = diff.length === 0

  const handlePublish = async () => {
    setPublishing(true)
    try {
      await onPublish()
      onOpenChange(false)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" data-testid="review-dialog">
        <DialogHeader>
          <DialogTitle>Revisar y publicar — {target}</DialogTitle>
          <DialogDescription>
            Nada se escribe hasta que confirmes. Las validaciones con error bloquean la publicación.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium">Validación</h3>
              {validating ? (
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Validando…
                </Badge>
              ) : blocked ? (
                <Badge variant="destructive" className="gap-1" data-testid="dialog-error-badge">
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

            {allIssues.length === 0 ? (
              <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Todas las reglas pasaron.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {allIssues.map((i, idx) => (
                  <li
                    key={idx}
                    data-testid="validation-issue"
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
                <table className="w-full text-sm" data-testid="diff-table">
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
                      <tr key={idx} className="border-b last:border-0" data-testid="diff-row">
                        <td className="px-4 py-2 font-mono text-xs">{d.location}</td>
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground line-through">{d.before}</td>
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
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={publishing}>
              Cancelar
            </Button>
            <Button
              disabled={blocked || noChanges || publishing || validating}
              onClick={handlePublish}
              data-testid="confirm-publish"
            >
              {publishing && <Loader2 className="h-4 w-4 animate-spin" />}
              {blocked ? "Bloqueado" : "Confirmar y publicar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

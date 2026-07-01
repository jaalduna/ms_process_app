import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { deleteAdminStage, getAdminStages, putAdminStage } from "@/lib/api"
import type { ApiError } from "@/types/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Pencil, Plus, Trash2 } from "lucide-react"

interface StageFormState {
  code: string
  name: string
  isNew: boolean
}

export function StagesTab() {
  const queryClient = useQueryClient()
  const { data: stages, isLoading } = useQuery({
    queryKey: ["admin", "stages"],
    queryFn: getAdminStages,
  })

  const [form, setForm] = useState<StageFormState | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "stages"] })

  const save = useMutation({
    mutationFn: (f: StageFormState) =>
      putAdminStage(f.code.trim().toLowerCase(), { name: f.name.trim() }),
    onSuccess: (s) => {
      toast.success(`Stage ${s.code} guardado`)
      setForm(null)
      invalidate()
    },
    onError: (e: ApiError) => toast.error(e.message ?? "Error al guardar stage"),
  })

  const remove = useMutation({
    mutationFn: deleteAdminStage,
    onSuccess: (r) => {
      toast.success(`Stage ${r.code} eliminado`)
      setDeleting(null)
      invalidate()
    },
    onError: (e: ApiError) => toast.error(e.message ?? "Error al eliminar stage"),
  })

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Etapas del pipeline, en orden de ejecución.
        </p>
        <Button size="sm" onClick={() => setForm({ code: "", name: "", isNew: true })}>
          <Plus className="h-4 w-4" />
          Agregar stage
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <th className="w-12 px-4 py-3">#</th>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(stages ?? []).map((s, i) => (
              <tr key={s.code} className="border-b transition-colors last:border-0 hover:bg-accent/40">
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{i + 1}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{s.code}</td>
                <td className="px-4 py-2.5">{s.name}</td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setForm({ code: s.code, name: s.name, isNew: false })}
                      aria-label={`Editar stage ${s.code}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleting(s.code)}
                      aria-label={`Eliminar stage ${s.code}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {stages?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Sin stages configurados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create / edit dialog */}
      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{form?.isNew ? "Agregar stage" : "Editar stage"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="admin-stage-code" className="text-sm font-medium">
                  Código
                </label>
                <Input
                  id="admin-stage-code"
                  value={form.code}
                  disabled={!form.isNew}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="precios"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="admin-stage-name" className="text-sm font-medium">
                  Nombre
                </label>
                <Input
                  id="admin-stage-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Precios"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!form?.code.trim() || !form.name.trim() || save.isPending}
              onClick={() => form && save.mutate(form)}
            >
              {save.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar stage</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el stage <span className="font-mono">{deleting}</span> de la
              configuración del pipeline.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleting && remove.mutate(deleting)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

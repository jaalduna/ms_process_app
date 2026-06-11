import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  deleteAdminJob,
  getAdminJobs,
  putAdminJob,
  putAdminJobDefaults,
} from "@/lib/api"
import type { ApiError } from "@/types/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

interface JobRow {
  process: string
  country: string
  jobId: number
}

interface JobFormState {
  process: string
  country: string
  jobId: string
  isNew: boolean
}

export function JobsTab() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "jobs"],
    queryFn: getAdminJobs,
  })

  const [form, setForm] = useState<JobFormState | null>(null)
  const [deleting, setDeleting] = useState<JobRow | null>(null)
  const [defaultsDraft, setDefaultsDraft] = useState<Record<string, string> | null>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "jobs"] })

  const saveJob = useMutation({
    mutationFn: (f: JobFormState) =>
      putAdminJob(f.process.trim().toLowerCase(), f.country.trim().toLowerCase(), Number(f.jobId)),
    onSuccess: (r) => {
      toast.success(`Job ${r.process}/${r.country} → ${r.job_id}`)
      setForm(null)
      invalidate()
    },
    onError: (e: ApiError) => toast.error(e.message ?? "Error al guardar job"),
  })

  const removeJob = useMutation({
    mutationFn: (row: JobRow) => deleteAdminJob(row.process, row.country),
    onSuccess: (r) => {
      toast.success(`Job ${r.process}/${r.country} eliminado`)
      setDeleting(null)
      invalidate()
    },
    onError: (e: ApiError) => toast.error(e.message ?? "Error al eliminar job"),
  })

  const saveDefaults = useMutation({
    mutationFn: (d: Record<string, string>) => putAdminJobDefaults(d),
    onSuccess: () => {
      toast.success("Defaults actualizados")
      setDefaultsDraft(null)
      invalidate()
    },
    onError: (e: ApiError) => toast.error(e.message ?? "Error al guardar defaults"),
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  const rows: JobRow[] = Object.entries(data?.jobs ?? {}).flatMap(([process, countries]) =>
    Object.entries(countries).map(([country, jobId]) => ({ process, country, jobId })),
  )
  const defaults = defaultsDraft ?? data?.defaults ?? {}
  const defaultsDirty = defaultsDraft !== null

  return (
    <div className="space-y-6">
      {/* Defaults */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Defaults de Databricks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="admin-catalog" className="text-sm font-medium">
                Catalog
              </label>
              <Input
                id="admin-catalog"
                value={defaults.catalog ?? ""}
                onChange={(e) => setDefaultsDraft({ ...defaults, catalog: e.target.value })}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="admin-volume-template" className="text-sm font-medium">
                Results volume template
              </label>
              <Input
                id="admin-volume-template"
                value={defaults.results_volume_template ?? ""}
                onChange={(e) =>
                  setDefaultsDraft({ ...defaults, results_volume_template: e.target.value })
                }
                className="font-mono text-xs"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {defaultsDirty && (
              <Button variant="outline" size="sm" onClick={() => setDefaultsDraft(null)}>
                Descartar
              </Button>
            )}
            <Button
              size="sm"
              disabled={!defaultsDirty || saveDefaults.isPending}
              onClick={() =>
                saveDefaults.mutate({
                  catalog: defaults.catalog ?? "",
                  results_volume_template: defaults.results_volume_template ?? "",
                })
              }
            >
              {saveDefaults.isPending ? "Guardando…" : "Guardar defaults"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Jobs map */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Mapa proceso × país → Databricks job ID.
          </p>
          <Button
            size="sm"
            onClick={() => setForm({ process: "", country: "", jobId: "", isNew: true })}
          >
            <Plus className="h-4 w-4" />
            Agregar job
          </Button>
        </div>

        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Proceso</th>
                <th className="px-4 py-3">País</th>
                <th className="px-4 py-3">Job ID</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr
                  key={`${row.process}/${row.country}`}
                  className="border-b transition-colors last:border-0 hover:bg-accent/40"
                >
                  <td className="px-4 py-2.5 font-medium">{row.process}</td>
                  <td className="px-4 py-2.5">{row.country}</td>
                  <td className="px-4 py-2.5 font-mono text-xs tabular-nums">{row.jobId}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setForm({
                            process: row.process,
                            country: row.country,
                            jobId: String(row.jobId),
                            isNew: false,
                          })
                        }
                        aria-label={`Editar job ${row.process}/${row.country}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleting(row)}
                        aria-label={`Eliminar job ${row.process}/${row.country}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Sin jobs configurados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / edit dialog */}
      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{form?.isNew ? "Agregar job" : "Editar job"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="admin-job-process" className="text-sm font-medium">
                  Proceso
                </label>
                <Input
                  id="admin-job-process"
                  value={form.process}
                  disabled={!form.isNew}
                  onChange={(e) => setForm({ ...form, process: e.target.value })}
                  placeholder="calibracion"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="admin-job-country" className="text-sm font-medium">
                  País
                </label>
                <Input
                  id="admin-job-country"
                  value={form.country}
                  disabled={!form.isNew}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  placeholder="chile"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="admin-job-id" className="text-sm font-medium">
                  Databricks Job ID
                </label>
                <Input
                  id="admin-job-id"
                  type="number"
                  value={form.jobId}
                  onChange={(e) => setForm({ ...form, jobId: e.target.value })}
                  placeholder="203536122848629"
                  className="font-mono text-xs"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancelar
            </Button>
            <Button
              disabled={
                !form?.process.trim() ||
                !form.country.trim() ||
                !/^\d+$/.test(form.jobId.trim()) ||
                saveJob.isPending
              }
              onClick={() => form && saveJob.mutate(form)}
            >
              {saveJob.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar job</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el mapeo{" "}
              <span className="font-mono">
                {deleting?.process}/{deleting?.country}
              </span>
              . Los triggers para ese proceso y país fallarán hasta reconfigurarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleting && removeJob.mutate(deleting)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

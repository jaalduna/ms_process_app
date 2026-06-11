import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { deleteAdminUser, getAdminUsers, putAdminUser } from "@/lib/api"
import type { ApiError } from "@/types/api"
import { KNOWN_ROLES, type AuthorizedUser } from "../types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Pencil, Trash2, UserPlus, ShieldCheck } from "lucide-react"

interface UserFormState {
  email: string
  name: string
  roles: string[]
  countries: string
}

const EMPTY_FORM: UserFormState = { email: "", name: "", roles: ["analyst"], countries: "" }

function parseCountries(raw: string): string[] {
  return raw
    .split(",")
    .map(c => c.trim().toLowerCase())
    .filter(Boolean)
}

export function UsersTab() {
  const queryClient = useQueryClient()
  const { data: users, isLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: getAdminUsers,
  })

  const [form, setForm] = useState<UserFormState | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] })

  const save = useMutation({
    mutationFn: (f: UserFormState) =>
      putAdminUser(f.email.trim().toLowerCase(), {
        name: f.name.trim(),
        roles: f.roles,
        countries: parseCountries(f.countries),
      }),
    onSuccess: (u) => {
      toast.success(`Usuario ${u.email} guardado`)
      setForm(null)
      invalidate()
    },
    onError: (e: ApiError) => toast.error(e.message ?? "Error al guardar usuario"),
  })

  const remove = useMutation({
    mutationFn: deleteAdminUser,
    onSuccess: (r) => {
      toast.success(`Acceso revocado: ${r.email}`)
      setDeleting(null)
      invalidate()
    },
    onError: (e: ApiError) => toast.error(e.message ?? "Error al eliminar usuario"),
  })

  const openEdit = (u: AuthorizedUser) => {
    setIsNew(false)
    setForm({ email: u.email, name: u.name, roles: u.roles, countries: u.countries.join(", ") })
  }

  const openNew = () => {
    setIsNew(true)
    setForm(EMPTY_FORM)
  }

  const toggleRole = (role: string) => {
    if (!form) return
    setForm({
      ...form,
      roles: form.roles.includes(role)
        ? form.roles.filter(r => r !== role)
        : [...form.roles, role],
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Allowlist de acceso: roles y países por usuario.
        </p>
        <Button size="sm" onClick={openNew}>
          <UserPlus className="h-4 w-4" />
          Agregar usuario
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Roles</th>
              <th className="px-4 py-3">Países</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map(u => (
              <tr key={u.email} className="border-b transition-colors last:border-0 hover:bg-accent/40">
                <td className="px-4 py-2.5 font-mono text-xs">{u.email}</td>
                <td className="px-4 py-2.5">{u.name || "—"}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map(r => (
                      <Badge
                        key={r}
                        variant={r === "admin" ? "default" : "secondary"}
                        className="gap-1 font-mono text-[10px]"
                      >
                        {r === "admin" && <ShieldCheck className="h-3 w-3" />}
                        {r}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                  {u.countries.length ? u.countries.join(", ") : "—"}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(u)}
                      aria-label={`Editar ${u.email}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleting(u.email)}
                      aria-label={`Eliminar ${u.email}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {users?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Sin usuarios autorizados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create / edit dialog */}
      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isNew ? "Agregar usuario" : "Editar usuario"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="admin-user-email" className="text-sm font-medium">
                  Email
                </label>
                <Input
                  id="admin-user-email"
                  type="email"
                  value={form.email}
                  disabled={!isNew}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="usuario@kantar.com"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="admin-user-name" className="text-sm font-medium">
                  Nombre
                </label>
                <Input
                  id="admin-user-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Nombre y apellido"
                />
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Roles</legend>
                <div className="grid grid-cols-2 gap-2">
                  {KNOWN_ROLES.map(role => (
                    <label key={role} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.roles.includes(role)}
                        onCheckedChange={() => toggleRole(role)}
                      />
                      <span className="font-mono text-xs">{role}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="space-y-2">
                <label htmlFor="admin-user-countries" className="text-sm font-medium">
                  Países
                </label>
                <Input
                  id="admin-user-countries"
                  value={form.countries}
                  onChange={(e) => setForm({ ...form, countries: e.target.value })}
                  placeholder="chile, mexico — o * para todos"
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Separados por coma. Usa <span className="font-mono">*</span> para acceso a todos los países.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!form?.email.trim() || form.roles.length === 0 || save.isPending}
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
            <AlertDialogTitle>Revocar acceso</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <span className="font-mono">{deleting}</span> del allowlist. El usuario
              perderá acceso en su siguiente request.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleting && remove.mutate(deleting)}
            >
              Revocar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

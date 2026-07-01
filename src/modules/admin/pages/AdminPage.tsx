import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { adminReload } from "@/lib/api"
import type { ApiError } from "@/types/api"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UsersTab } from "../components/UsersTab"
import { JobsTab } from "../components/JobsTab"
import { StagesTab } from "../components/StagesTab"
import { RotateCcw, Users, Workflow, ListOrdered } from "lucide-react"

export function AdminPage() {
  const queryClient = useQueryClient()

  const reload = useMutation({
    mutationFn: adminReload,
    onSuccess: () => {
      toast.success("Cache del backend recargado")
      queryClient.invalidateQueries({ queryKey: ["admin"] })
    },
    onError: (e: ApiError) => toast.error(e.message ?? "Error al recargar cache"),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Administración</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Usuarios autorizados, jobs de Databricks y stages del pipeline
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={reload.isPending}
          onClick={() => reload.mutate()}
        >
          <RotateCcw className="h-4 w-4" />
          {reload.isPending ? "Recargando…" : "Recargar cache"}
        </Button>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">
            <Users className="h-3.5 w-3.5" />
            Usuarios
          </TabsTrigger>
          <TabsTrigger value="jobs">
            <Workflow className="h-3.5 w-3.5" />
            Jobs
          </TabsTrigger>
          <TabsTrigger value="stages">
            <ListOrdered className="h-3.5 w-3.5" />
            Stages
          </TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="jobs">
          <JobsTab />
        </TabsContent>
        <TabsContent value="stages">
          <StagesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

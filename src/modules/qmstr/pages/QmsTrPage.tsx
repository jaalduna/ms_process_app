import { useMemo } from "react"
import { toast } from "sonner"
import { AxiosError } from "axios"
import { Gauge, Loader2 } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/hooks/useAuth"
import { useCountries } from "@/hooks/useCountries"
import { getPermissions } from "@/lib/permissions"
import { COUNTRY_LABELS } from "@/lib/countries"
import { cn } from "@/lib/utils"
import { useCancelQmsTrRun, useCreateQmsTrRun, useQmsTrRuns, useValidateQmsTrRun } from "../hooks/useQmsTr"
import { QmsTrLaunchPanel } from "../components/QmsTrLaunchPanel"
import { QmsTrRunCard } from "../components/QmsTrRunCard"
import { formatChile } from "../time"
import { ACTIVE_STATUSES, QMSTR_COUNTRIES, STATUS_META, type QmsTrRun } from "../types"

const ROLES_QMSTR = ["admin", "qmstr_specialist", "qms_tr_specialist"]

function mensajeError(e: unknown): string {
  if (e instanceof AxiosError) {
    const d = e.response?.data as { message?: string } | undefined
    return d?.message ?? e.message
  }
  return (e as Error).message
}

export function QmsTrPage() {
  const { roles } = useAuth()
  const { canViewDatabricksRun } = getPermissions(roles)
  const canTrigger = roles.some((r) => ROLES_QMSTR.includes(r.toLowerCase()))
  const { data: countriesData } = useCountries()
  const { data: runs, isLoading } = useQmsTrRuns()
  const crear = useCreateQmsTrRun()
  const cancelar = useCancelQmsTrRun()
  const validar = useValidateQmsTrRun()

  const paises = useMemo(() => {
    const disponibles = new Set((countriesData?.countries ?? []).map((c) => c.code))
    return QMSTR_COUNTRIES.filter((c) => disponibles.has(c))
  }, [countriesData])
  const activas = (runs ?? []).filter((r) => ACTIVE_STATUSES.includes(r.status))
  const recientes = (runs ?? []).filter((r) => !ACTIVE_STATUSES.includes(r.status))
  const ocupados = new Set(activas.map((r) => `${r.country}:${r.mes_procesamiento}`))
  // la última corrida terminada de cada país sin otra activa queda como tarjeta: completada (descarga +
  // validación) o fallida (su error). Las runs vienen ordenadas de la más reciente a la más antigua.
  const conActiva = new Set(activas.map((r) => r.country))
  const ultimas = recientes.filter(
    (r, i) => !conActiva.has(r.country) && recientes.findIndex((x) => x.country === r.country) === i
      && (r.status === "completed" || r.status === "failed"),
  )

  function lanzar(data: Parameters<typeof crear.mutate>[0]) {
    crear.mutate(data, {
      onSuccess: (run) =>
        toast.success(
          run.status === "waiting_snapshot"
            ? "Corrida creada: esperando el snapshot de J"
            : `QMS-TR iniciado para ${COUNTRY_LABELS[run.country] ?? run.country}`,
        ),
      onError: (e) => toast.error(`No se pudo iniciar QMS-TR: ${mensajeError(e)}`),
    })
  }

  function tarjeta(run: QmsTrRun) {
    return (
      <QmsTrRunCard
        key={run.run_id}
        run={run}
        canTrigger={canTrigger}
        canViewDatabricksRun={canViewDatabricksRun}
        cancelling={cancelar.isPending && cancelar.variables === run.run_id}
        validating={validar.isPending && validar.variables === run.run_id}
        onCancel={(id) =>
          cancelar.mutate(id, {
            onSuccess: () => toast.success("Corrida cancelada"),
            onError: (e) => toast.error(`No se pudo cancelar: ${mensajeError(e)}`),
          })
        }
        onValidate={(id) =>
          validar.mutate(id, {
            onSuccess: (r) =>
              r.validacion?.status === "aplicado"
                ? toast.success("Todos los cambios revisados están aplicados en J")
                : toast.warning("Hay cambios que todavía no están en J"),
            onError: (e) => toast.error(`No se pudo validar: ${mensajeError(e)}`),
          })
        }
      />
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Gauge className="size-5 text-primary" />
        <h1 className="text-xl font-semibold">QMS-TR</h1>
      </div>

      <QmsTrLaunchPanel
        countries={paises}
        busy={ocupados}
        launching={crear.isPending}
        canTrigger={canTrigger}
        onLaunch={lanzar}
      />

      {isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Cargando corridas…
        </p>
      )}

      {(activas.length > 0 || ultimas.length > 0) && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Corridas</h2>
          {activas.map(tarjeta)}
          {ultimas.map(tarjeta)}
        </section>
      )}

      {recientes.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Historial</h2>
          <Table data-testid="qmstr-historial">
            <TableHeader>
              <TableRow>
                <TableHead>País</TableHead>
                <TableHead>Mes</TableHead>
                <TableHead>Instante</TableHead>
                <TableHead>Snapshot J</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Validación</TableHead>
                <TableHead>Lanzada por</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recientes.map((r) => {
                const meta = STATUS_META[r.status] ?? STATUS_META.pending
                return (
                  <TableRow key={r.run_id}>
                    <TableCell>{COUNTRY_LABELS[r.country] ?? r.country}</TableCell>
                    <TableCell>{r.mes_procesamiento}</TableCell>
                    <TableCell>{formatChile(r.at)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.snapshot?.j ? `v${r.snapshot.j.version}` : "—"}</TableCell>
                    <TableCell>
                      <Badge className={cn("border-transparent", meta.className)}>{meta.label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.validacion ? `${r.validacion.applied}/${r.validacion.checked} en J` : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.created_by ?? "—"}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  )
}

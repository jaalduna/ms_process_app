import { Check } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { mensajeError } from "@/modules/qmstr/components/flujo/formato"
import type { ConfigProceso } from "../config"
import { fechaHora, TONO, textoTono, valorKpi, valorParametro } from "../format"
import { useElegirEscenario, useEscenarios, type Cierre } from "../hooks"
import type { Escenario, Parametros } from "../types"

export function CompararPaso({ config, cierre, parametros, onIterar, onPublicar }: {
  config: ConfigProceso
  cierre: Cierre
  parametros: Parametros | undefined
  onIterar: () => void
  onPublicar: () => void
}) {
  const { data, isLoading, error } = useEscenarios(cierre, true)
  const elegir = useElegirEscenario(cierre)

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
        No se pudieron cargar los escenarios: {mensajeError(error)}
      </div>
    )
  }
  if (isLoading || !data || !parametros) return <Skeleton className="h-64 rounded-xl" />

  const columnasKpi = data.escenarios[0]?.resumen ?? []

  const cambios = (e: Escenario) =>
    parametros.definiciones
      .filter((d) => e.parametros[d.clave] !== parametros.referencia.valores[d.clave])
      .map((d) => `${d.clave} ${valorParametro(d, e.parametros[d.clave])}`)

  return (
    <div className="space-y-5">
      <div className="max-w-3xl">
        <h2 className="text-xl font-semibold">Comparar escenarios</h2>
        <p className="text-sm text-muted-foreground">
          Cada escenario guarda sus parámetros y ajustes, así queda claro con qué se publicó. Elige el que va a
          aprobación.
        </p>
      </div>

      <div className="rounded-xl border bg-card px-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Escenario</TableHead>
              <TableHead>Cambios vs {parametros.referencia.etiqueta.toLowerCase()}</TableHead>
              <TableHead>Ajustes</TableHead>
              {columnasKpi.map((k) => (
                <TableHead key={k.id} className="text-right">
                  {k.etiqueta}
                </TableHead>
              ))}
              <TableHead>
                <span className="sr-only">Elegir</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.escenarios.map((e) => {
              const elegido = e.id === data.elegido_id
              const c = cambios(e)
              return (
                <TableRow key={e.id} className={cn(elegido && "bg-accent/60")} data-testid={`it-escenario-${e.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      {e.nombre}
                      {e.es_referencia && <Badge variant="secondary">Referencia</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {e.creado_por} · {fechaHora(e.creado_en)}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-64 text-sm whitespace-normal">
                    {c.length ? c.join(" · ") : <span className="text-muted-foreground">Sin cambios</span>}
                  </TableCell>
                  <TableCell className="max-w-56 text-sm whitespace-normal">{config.describirAjustes(e.ajustes)}</TableCell>
                  {columnasKpi.map((col) => {
                    const k = e.resumen.find((x) => x.id === col.id)
                    return (
                      <TableCell
                        key={col.id}
                        className="text-right font-medium tabular-nums"
                        style={k?.estado && k.estado !== "neutro" ? textoTono(TONO[k.estado]) : undefined}
                      >
                        {k ? valorKpi(k) : "—"}
                      </TableCell>
                    )
                  })}
                  <TableCell>
                    {elegido ? (
                      <span className="inline-flex items-center gap-1 text-sm font-medium">
                        <Check className="size-4" aria-hidden /> Elegido
                      </span>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={elegir.isPending}
                        onClick={() =>
                          elegir.mutate(e.id, { onError: (err) => toast.error(`No se pudo elegir: ${mensajeError(err)}`) })
                        }
                      >
                        Elegir
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={onIterar}>
          Seguir iterando
        </Button>
        <Button onClick={onPublicar} disabled={!data.elegido_id}>
          Ir a aprobar y publicar
        </Button>
      </div>
    </div>
  )
}

import { Database, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { mensajeError } from "@/modules/qmstr/components/flujo/formato"
import { fechaHora, num, TONO, textoTono } from "../format"
import { usePrepararDatos, type Cierre } from "../hooks"
import type { Preparacion } from "../types"
import { ItemNivel, Seccion } from "./piezas"

const ESTADO_TABLA: Record<Preparacion["tablas"][number]["estado"], { texto: string; tono: string }> = {
  lista: { texto: "Lista", tono: TONO.ok },
  pendiente: { texto: "Pendiente", tono: TONO.neutro },
  error: { texto: "Error", tono: TONO.error },
}

export function PrepararPaso({ cierre, preparacion, cargando, onContinuar }: {
  cierre: Cierre
  preparacion: Preparacion | undefined
  cargando: boolean
  onContinuar: () => void
}) {
  const preparar = usePrepararDatos(cierre)

  if (cargando || !preparacion) return <Skeleton className="h-80 rounded-xl" />

  const dependenciaPendiente = preparacion.dependencias.some((d) => d.estado === "pendiente")
  const hayErrores = preparacion.validaciones.some((v) => v.nivel === "error")
  const lanzar = () =>
    preparar.mutate(undefined, { onError: (e) => toast.error(`No se pudo preparar: ${mensajeError(e)}`) })

  return (
    <div className="space-y-5">
      <div className="max-w-3xl">
        <h2 className="text-xl font-semibold">Preparar los datos del cierre</h2>
        <p className="text-sm text-muted-foreground">
          Se extraen y limpian una sola vez por país y período. Después cada vuelta de parámetros corre sobre estos
          datos preparados, en segundos y sin volver a SQL.
        </p>
      </div>

      {preparacion.dependencias.length > 0 && (
        <Seccion titulo="Depende de">
          <ul className="space-y-3">
            {preparacion.dependencias.map((d) => (
              <ItemNivel
                key={d.proceso}
                nivel={d.estado === "publicada" ? "ok" : "aviso"}
                titulo={d.proceso === "elegibilidad" ? "Elegibilidad del mismo cierre" : d.proceso}
                detalle={d.detalle}
              />
            ))}
          </ul>
        </Seccion>
      )}

      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        <Seccion titulo="Tablas de entrada" detalle={preparacion.fuente}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tabla</TableHead>
                <TableHead className="text-right">Filas</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preparacion.tablas.map((t) => (
                <TableRow key={t.nombre}>
                  <TableCell className="font-medium">{t.nombre}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.filas == null ? "—" : num(t.filas)}</TableCell>
                  <TableCell style={textoTono(ESTADO_TABLA[t.estado].tono)} className="font-medium">
                    {ESTADO_TABLA[t.estado].texto}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Seccion>

        <Seccion titulo="Validaciones antes de iterar">
          {preparacion.validaciones.length === 0 ? (
            <p className="text-sm text-muted-foreground">Se calculan al preparar los datos.</p>
          ) : (
            <ul className="space-y-3">
              {preparacion.validaciones.map((v) => (
                <ItemNivel key={v.id} nivel={v.nivel} titulo={v.titulo} detalle={v.detalle} />
              ))}
            </ul>
          )}
        </Seccion>
      </div>

      {preparacion.estado === "error" && preparacion.error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          La preparación falló: {preparacion.error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {preparacion.estado === "lista" ? (
          <>
            <span className="inline-flex items-center gap-2 text-sm font-medium" style={textoTono(TONO.ok)}>
              <Database className="size-4" aria-hidden />
              Datos preparados
              {preparacion.preparado_en && ` · ${fechaHora(preparacion.preparado_en)}`}
              {preparacion.version_silver && ` · silver ${preparacion.version_silver}`}
            </span>
            <Button onClick={onContinuar} disabled={hayErrores} data-testid="it-continuar-iterar">
              Continuar a iterar
            </Button>
            <Button variant="ghost" onClick={lanzar} disabled={preparar.isPending}>
              <RefreshCw aria-hidden /> Volver a preparar
            </Button>
          </>
        ) : preparacion.estado === "preparando" ? (
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Preparando… puedes cerrar esta pestaña, no se pierde.
          </span>
        ) : (
          <>
            <Button
              onClick={lanzar}
              disabled={preparar.isPending || dependenciaPendiente}
              data-testid="it-preparar"
            >
              {preparar.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {preparacion.estado === "error" ? "Reintentar preparación" : "Preparar datos"}
            </Button>
            <span className="text-sm text-muted-foreground">
              {dependenciaPendiente
                ? "Se habilita cuando Elegibilidad de este cierre esté publicada."
                : "Corre una vez por cierre; las vueltas siguientes no vuelven a extraer."}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

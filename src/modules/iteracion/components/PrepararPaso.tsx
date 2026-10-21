import { Check, Circle, Database, Loader2, RefreshCw } from "lucide-react"
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

/** 95 → "1:35". */
function reloj(seg: number): string {
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`
}

type Paso = NonNullable<Preparacion["progreso"]>["pasos"][number]

/** Estado en vivo de un paso de la preparación: mientras corre, reemplaza al «Pendiente» de la tabla. */
function EstadoPaso({ paso }: { paso: Paso }) {
  if (paso.estado === "listo") {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium" style={textoTono(TONO.ok)}>
        <Check className="size-3.5" aria-hidden />
        Lista{paso.segundos != null && ` · ${reloj(paso.segundos)}`}
      </span>
    )
  }
  if (paso.estado === "en_curso") {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium" style={textoTono(TONO.neutro)}>
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Leyendo{paso.segundos != null && ` · ${reloj(paso.segundos)}`}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <Circle className="size-3" aria-hidden />
      En cola
    </span>
  )
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
  const progreso = preparacion.estado === "preparando" ? preparacion.progreso : null
  const pasoDe = new Map(progreso?.pasos.map((p) => [p.id, p]))
  const otrosPasos = progreso?.pasos.filter((p) => !preparacion.tablas.some((t) => t.nombre === p.id)) ?? []
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
        <Seccion
          ancla="preparar.tablas"
          titulo="Tablas de entrada"
          detalle={preparacion.fuente}
          accion={
            preparacion.estado === "preparando" && (
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums" role="status">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Preparando{progreso && ` · ${reloj(progreso.segundos)}`}
              </span>
            )
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tabla</TableHead>
                <TableHead className="text-right">Filas</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preparacion.tablas.map((t) => {
                const paso = pasoDe.get(t.nombre)
                const filas = paso ? paso.filas : t.filas
                return (
                  <TableRow key={t.nombre} data-testid={`it-tabla-${t.nombre}`}>
                    <TableCell className="font-medium">{t.nombre}</TableCell>
                    <TableCell className="text-right tabular-nums">{filas == null ? "—" : num(filas)}</TableCell>
                    {paso ? (
                      <TableCell><EstadoPaso paso={paso} /></TableCell>
                    ) : (
                      <TableCell style={textoTono(ESTADO_TABLA[t.estado].tono)} className="font-medium">
                        {ESTADO_TABLA[t.estado].texto}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
              {otrosPasos.map((p) => (
                <TableRow key={p.id} data-testid={`it-tabla-${p.id}`}>
                  <TableCell colSpan={2} className="text-muted-foreground">{p.titulo}</TableCell>
                  <TableCell><EstadoPaso paso={p} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Seccion>

        <Seccion ancla="preparar.validaciones" titulo="Validaciones antes de iterar">
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
          <span className="text-sm text-muted-foreground">
            El avance se ve tabla por tabla arriba. Puedes cerrar esta pestaña, no se pierde.
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

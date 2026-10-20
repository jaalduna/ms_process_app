import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { mensajeError } from "@/modules/qmstr/components/flujo/formato"
import { Chip } from "@/modules/qmstr/components/flujo/piezas"
import type { ConfigProceso } from "../config"
import { fechaHora, TONO, valorKpi } from "../format"
import { useAccionPublicacion, useEscenarios, usePublicacion, type Cierre } from "../hooks"
import type { Publicacion } from "../types"
import { ItemNivel, Seccion } from "./piezas"

const ESTADO: Record<Publicacion["estado"], { texto: string; tono: string }> = {
  borrador: { texto: "Borrador", tono: TONO.neutro },
  pendiente: { texto: "Pendiente de aprobación", tono: TONO.aviso },
  publicada: { texto: "Publicada", tono: TONO.ok },
}

const DESTINOS = [
  { id: "sql" as const, titulo: "Escribir directo en SQL", detalle: "Upsert por IdPeso y período, con respaldo previo" },
  { id: "kronos" as const, titulo: "Generar Excel para Kronos", detalle: "Como hoy: se descarga y alguien lo sube a Kronos" },
]

export function PublicarPaso({ config, cierre }: { config: ConfigProceso; cierre: Cierre }) {
  const pub = usePublicacion(cierre, true)
  const esc = useEscenarios(cierre, true)
  const accion = useAccionPublicacion(cierre)
  const [destino, setDestino] = useState<"sql" | "kronos">("sql")
  const [devolviendo, setDevolviendo] = useState(false)
  const [comentario, setComentario] = useState("")

  if (pub.error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
        No se pudo cargar la publicación: {mensajeError(pub.error)}
      </div>
    )
  }
  if (!pub.data || !esc.data) return <Skeleton className="h-64 rounded-xl" />

  const p = pub.data
  const elegidoId = p.estado === "borrador" ? esc.data.elegido_id : p.escenario_id
  const elegido = esc.data.escenarios.find((e) => e.id === elegidoId)
  const destinoActual = p.estado === "borrador" ? destino : p.destino
  const error = (verbo: string) => (e: unknown) => toast.error(`No se pudo ${verbo}: ${mensajeError(e)}`)

  const enviar = () => {
    if (!elegido) return
    accion.mutate(
      { tipo: "enviar", escenario_id: elegido.id, destino: config.eligeDestino ? destino : undefined },
      { onSuccess: () => toast.success("Enviado a aprobación"), onError: error("enviar") },
    )
  }
  const aprobar = () =>
    accion.mutate({ tipo: "aprobar" }, { onSuccess: () => toast.success("Aprobado y publicado"), onError: error("aprobar") })
  const devolver = () => {
    if (!comentario.trim()) {
      toast.error("Escribe por qué lo devuelves")
      return
    }
    accion.mutate(
      { tipo: "devolver", comentario: comentario.trim() },
      {
        onSuccess: () => {
          setDevolviendo(false)
          setComentario("")
          toast.success("Devuelto al analista")
        },
        onError: error("devolver"),
      },
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h2 className="text-xl font-semibold">Aprobar y publicar</h2>
          <p className="text-sm text-muted-foreground">
            {elegido ? (
              <>
                Escenario: <span className="font-medium text-foreground">{elegido.nombre}</span>
                {elegido.resumen.length > 0 && <> · {elegido.resumen.slice(0, 2).map((k) => `${k.etiqueta.toLowerCase()} ${valorKpi(k)}`).join(" · ")}</>}
              </>
            ) : (
              "Elige un escenario en Comparar."
            )}
          </p>
        </div>
        <Chip tone={ESTADO[p.estado].tono} dot="solid" data-testid="it-estado-publicacion">
          {ESTADO[p.estado].texto}
        </Chip>
      </div>

      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
        <Seccion ancla="publicar.plan" titulo="Qué se va a escribir" detalle="En el orden en que se ejecuta">
          {config.eligeDestino && (
            <fieldset className="grid gap-2" disabled={p.estado !== "borrador"}>
              <legend className="sr-only">Destino</legend>
              {DESTINOS.map((d) => (
                <label
                  key={d.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border-2 px-3 py-2",
                    destinoActual === d.id ? "border-primary" : "border-border",
                  )}
                >
                  <input
                    type="radio"
                    name="destino"
                    value={d.id}
                    checked={destinoActual === d.id}
                    onChange={() => setDestino(d.id)}
                    className="mt-1 accent-[var(--primary)]"
                  />
                  <span>
                    <span className="block text-sm font-medium">{d.titulo}</span>
                    <span className="block text-xs text-muted-foreground">{d.detalle}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paso</TableHead>
                <TableHead>Tabla</TableHead>
                <TableHead>Cambio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.plan.map((w) => (
                <TableRow key={w.paso}>
                  <TableCell className="tabular-nums">{w.paso}</TableCell>
                  <TableCell className="font-medium">{w.tabla}</TableCell>
                  <TableCell className="whitespace-normal">{w.cambio}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Seccion>

        <Seccion titulo="Antes de publicar">
          <ul className="space-y-3">
            {p.chequeos.map((c) => (
              <ItemNivel key={c.texto} nivel={c.nivel} titulo={c.texto} />
            ))}
          </ul>
          <div className="space-y-3 border-t pt-4">
            {p.estado === "borrador" && (
              <Button onClick={enviar} disabled={!p.puede_enviar || !elegido || accion.isPending} data-testid="it-enviar">
                {accion.isPending && <Loader2 className="animate-spin" aria-hidden />}
                Enviar a aprobación
              </Button>
            )}
            {p.estado === "pendiente" && p.puede_aprobar && !devolviendo && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={aprobar} disabled={accion.isPending} data-testid="it-aprobar">
                  {accion.isPending && <Loader2 className="animate-spin" aria-hidden />}
                  Aprobar y publicar
                </Button>
                <Button variant="outline" onClick={() => setDevolviendo(true)}>
                  Devolver con comentario
                </Button>
              </div>
            )}
            {devolviendo && (
              <div className="space-y-2">
                <label htmlFor="it-comentario" className="text-sm font-medium">
                  ¿Qué hay que revisar?
                </label>
                <Textarea id="it-comentario" value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3} />
                <div className="flex gap-2">
                  <Button onClick={devolver} disabled={accion.isPending}>
                    Devolver
                  </Button>
                  <Button variant="ghost" onClick={() => setDevolviendo(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
            {p.estado === "pendiente" && !p.puede_aprobar && (
              <p className="text-sm text-muted-foreground">
                Enviado por {p.enviado_por}. Lo aprueba otra persona con rol de responsable.
              </p>
            )}
            {p.estado === "publicada" && (
              <p className="text-sm text-muted-foreground">
                Aprobado por {p.aprobado_por}
                {p.engine === "simulated" && " · (simulado) no se escribió en SQL"}.
              </p>
            )}
          </div>
        </Seccion>
      </div>

      <Seccion titulo="Bitácora">
        {p.bitacora.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin movimientos todavía.</p>
        ) : (
          <ol className="space-y-2">
            {p.bitacora.map((b, i) => (
              <li key={i} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 text-sm">
                <span className="text-muted-foreground tabular-nums">{fechaHora(b.en)}</span>
                <span>
                  <span className="font-medium">{b.usuario}</span> · {b.texto}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Seccion>
    </div>
  )
}

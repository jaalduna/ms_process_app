import { createContext, useContext, useState, type ReactNode } from "react"
import { MessageCircleQuestion, MessageSquarePlus, MessagesSquare } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { mensajeError } from "@/modules/qmstr/components/flujo/formato"
import { cambiarEstadoConversacion, crearConversacion, responderConversacion } from "../api"
import { fechaHora } from "../format"
import { useAccionConversacion, useConversaciones } from "../hooks"
import { useAdjuntosBorrador } from "../adjuntos"
import { ConAdjuntos, ListaAdjuntos } from "./Adjuntos"
import type { Ancla, EstadoHilo, Hilo, ProcesoConv, TipoHilo } from "../types"

const ANCLAS: Record<Ancla, string> = {
  "preparar.tablas": "Preparar · Tablas de entrada",
  "preparar.validaciones": "Preparar · Validaciones",
  "iterar.parametros": "Iterar · Parámetros",
  "iterar.regiones": "Iterar · Muestra por región",
  "iterar.idpeso": "Iterar · Resultado por IdPeso",
  "iterar.revision": "Iterar · Revisión contra la historia",
  "iterar.celdas": "Iterar · Celdas del universo",
  "iterar.juntas": "Iterar · Juntas",
  "comparar.escenarios": "Comparar · Escenarios",
  "publicar.plan": "Publicar · Qué se va a escribir",
  "qmstr.tablero": "Tablero de bases",
  "qmstr.lanzar": "Lanzar QMS-TR",
  "qmstr.tandas": "Tandas",
  "qmstr.bases": "Bases",
  "qmstr.reporte": "Reporte de la tanda",
  "qmstr.revertir": "Revertir",
}

/** Secciones donde se puede comentar en cada proceso: QMS-TR tiene las suyas. */
const anclasDe = (proceso: ProcesoConv) =>
  (Object.keys(ANCLAS) as Ancla[]).filter((a) => a.startsWith("qmstr.") === (proceso === "qmstr"))

const TIPOS: Record<TipoHilo, string> = { pregunta: "Pregunta", comentario: "Comentario", problema: "Problema" }

interface Ctx {
  proceso: ProcesoConv
  pais: string
  hilos: Hilo[]
  abrir: (ancla: Ancla | null) => void
}

const ConversacionesCtx = createContext<Ctx | null>(null)

/** Hilos que corresponden al país en pantalla: los generales y los de ese país. */
const delPais = (hilos: Hilo[], pais: string) => hilos.filter((h) => h.pais === null || h.pais === pais)

/**
 * Preguntas, comentarios y problemas anclados a las secciones del flujo. Las secciones con `ancla`
 * muestran una burbuja; el panel lateral lista, filtra, responde y resuelve. `onIr` lleva al paso
 * y la sección de un hilo.
 */
export function ConversacionesProvider({ proceso, pais, onIr, children }: {
  proceso: ProcesoConv
  pais: string
  onIr: (ancla: Ancla) => void
  children: ReactNode
}) {
  const q = useConversaciones(proceso)
  const [abierto, setAbierto] = useState(false)
  const [ancla, setAncla] = useState<Ancla | null>(null)
  const hilos = delPais(q.data ?? [], pais)
  const abrir = (a: Ancla | null) => {
    setAncla(a)
    setAbierto(true)
  }
  return (
    <ConversacionesCtx.Provider value={{ proceso, pais, hilos, abrir }}>
      {children}
      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent className="w-full gap-0 sm:max-w-xl" data-testid="it-conversaciones">
          <SheetHeader className="border-b">
            <SheetTitle>{ancla ? ANCLAS[ancla] : "Preguntas y comentarios"}</SheetTitle>
            <SheetDescription>
              Lo ven y lo responden todos los que trabajan en este proceso. Tu nombre queda en lo que escribas.
            </SheetDescription>
            {ancla && (
              <button type="button" className="w-fit text-left text-xs underline" onClick={() => setAncla(null)}>
                Ver todas las secciones
              </button>
            )}
          </SheetHeader>
          {q.error ? (
            <p className="p-4 text-sm text-destructive" role="alert">
              No se pudieron cargar las conversaciones: {mensajeError(q.error)}
            </p>
          ) : (
            <Panel
              proceso={proceso}
              pais={pais}
              hilos={hilos}
              ancla={ancla}
              onIr={(a) => {
                setAbierto(false)
                onIr(a)
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </ConversacionesCtx.Provider>
  )
}

/** Botón de la cabecera: abre el panel con todo y dice cuántas siguen abiertas. */
export function BotonConversaciones() {
  const ctx = useContext(ConversacionesCtx)
  if (!ctx) return null
  const abiertas = ctx.hilos.filter((h) => h.estado === "abierta").length
  return (
    <Button variant="outline" size="sm" onClick={() => ctx.abrir(null)} data-testid="it-boton-conversaciones">
      <MessagesSquare aria-hidden />
      Preguntas y comentarios
      {abiertas > 0 && (
        <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">{abiertas}</span>
      )}
    </Button>
  )
}

/** Burbuja de una sección: «?» con las preguntas abiertas de ahí, o «comentar» si no hay ninguna. */
export function Burbuja({ ancla }: { ancla: Ancla }) {
  const ctx = useContext(ConversacionesCtx)
  if (!ctx) return null
  const aqui = ctx.hilos.filter((h) => h.ancla === ancla)
  const abiertas = aqui.filter((h) => h.estado === "abierta").length
  const Icono = abiertas > 0 ? MessageCircleQuestion : MessageSquarePlus
  return (
    <button
      type="button"
      onClick={() => ctx.abrir(ancla)}
      data-testid={`it-burbuja-${ancla}`}
      title={abiertas > 0 ? `${abiertas} pregunta(s) o comentario(s) abiertos aquí` : "Comentar esta sección"}
      aria-label={abiertas > 0 ? `${abiertas} conversaciones abiertas en ${ANCLAS[ancla]}` : `Comentar ${ANCLAS[ancla]}`}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs font-medium transition-colors",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        abiertas > 0
          ? "border-[var(--qf-wp-blue)] bg-[color-mix(in_oklab,var(--qf-wp-blue)_14%,transparent)] hover:bg-[color-mix(in_oklab,var(--qf-wp-blue)_24%,transparent)]"
          : "text-muted-foreground hover:bg-accent",
      )}
    >
      <Icono className="size-3.5" aria-hidden />
      {abiertas > 0 ? abiertas : aqui.length > 0 ? aqui.length : null}
    </button>
  )
}

function Panel({ proceso, pais, hilos, ancla, onIr }: {
  proceso: ProcesoConv
  pais: string
  hilos: Hilo[]
  ancla: Ancla | null
  onIr: (ancla: Ancla) => void
}) {
  const [estado, setEstado] = useState<EstadoHilo | "todas">("abierta")
  const [tipo, setTipo] = useState<TipoHilo | "todos">("todos")
  const visibles = hilos
    .filter((h) => (ancla ? h.ancla === ancla : true))
    .filter((h) => estado === "todas" || h.estado === estado)
    .filter((h) => tipo === "todos" || h.tipo === tipo)
    .sort((a, b) => b.actualizado.localeCompare(a.actualizado))
  const chip = (on: boolean) =>
    cn(
      "h-7 rounded-full border px-2.5 text-xs font-medium transition-colors",
      on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
    )
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b px-4 py-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Estado">
          {(["abierta", "resuelta", "todas"] as const).map((e) => (
            <button key={e} type="button" aria-pressed={estado === e} className={chip(estado === e)} onClick={() => setEstado(e)}>
              {e === "abierta" ? "Abiertas" : e === "resuelta" ? "Resueltas" : "Todas"}
            </button>
          ))}
          <span className="mx-1 w-px bg-border" aria-hidden />
          {(["todos", "pregunta", "comentario", "problema"] as const).map((t) => (
            <button key={t} type="button" aria-pressed={tipo === t} className={chip(tipo === t)} onClick={() => setTipo(t)}>
              {t === "todos" ? "Todo" : `${TIPOS[t]}s`}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {visibles.length === 0 && (
          <p className="text-sm text-muted-foreground" role="status">
            {estado === "abierta" ? "No hay nada abierto aquí." : "No hay conversaciones con este filtro."}
          </p>
        )}
        {visibles.map((h) => (
          <TarjetaHilo key={h.id} proceso={proceso} hilo={h} conIr={!ancla} onIr={() => onIr(h.ancla)} />
        ))}
      </div>
      <Nuevo proceso={proceso} pais={pais} ancla={ancla} />
    </div>
  )
}

function TarjetaHilo({ proceso, hilo, conIr, onIr }: { proceso: ProcesoConv; hilo: Hilo; conIr: boolean; onIr: () => void }) {
  const [texto, setTexto] = useState("")
  const adjuntos = useAdjuntosBorrador(proceso)
  const responder = useAccionConversacion(proceso, (t: string) => responderConversacion(proceso, hilo.id, t, adjuntos.ids))
  const estado = useAccionConversacion(proceso, (e: EstadoHilo) => cambiarEstadoConversacion(proceso, hilo.id, e))
  const resuelta = hilo.estado === "resuelta"
  const enviar = () =>
    responder.mutate(texto, {
      onSuccess: () => {
        setTexto("")
        adjuntos.limpiar()
      },
      onError: (e) => toast.error(`No se pudo responder: ${mensajeError(e)}`),
    })
  return (
    <article className={cn("space-y-2 rounded-lg border p-3", resuelta && "opacity-70")} data-testid={`it-hilo-${hilo.id}`}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{TIPOS[hilo.tipo]}</span>
        <span className={cn("rounded px-1.5 py-0.5 font-medium", resuelta ? "bg-muted" : "bg-[color-mix(in_oklab,var(--qf-wp-blue)_16%,transparent)]")}>
          {resuelta ? "Resuelta" : "Abierta"}
        </span>
        {hilo.pais && <span className="text-muted-foreground">· solo {hilo.pais}</span>}
        {conIr && (
          <button type="button" className="ml-auto underline" onClick={onIr}>
            Ir a {ANCLAS[hilo.ancla]}
          </button>
        )}
      </div>
      <h3 className="text-sm font-semibold">{hilo.titulo}</h3>
      <p className="text-sm whitespace-pre-line">{hilo.texto}</p>
      <ListaAdjuntos proceso={proceso} adjuntos={hilo.adjuntos} />
      {hilo.propuesta && (
        <div className="rounded-md border-l-[3px] border-[var(--qf-wp-blue)] bg-muted/60 px-3 py-2 text-sm">
          <div className="text-xs font-semibold">Nuestra propuesta</div>
          {hilo.propuesta}
        </div>
      )}
      <div className="text-xs text-muted-foreground">
        {hilo.autor.nombre} · {fechaHora(hilo.creado)}
      </div>
      {hilo.mensajes.length > 0 && (
        <ol className="space-y-2 border-l pl-3">
          {hilo.mensajes.map((m) => (
            <li key={m.id} className="text-sm">
              <span className="font-medium">{m.autor.nombre}</span>{" "}
              <span className="text-xs text-muted-foreground">{fechaHora(m.creado)}</span>
              <p className={cn("whitespace-pre-line", m.texto.startsWith("· ") && "text-xs text-muted-foreground")}>{m.texto}</p>
              <ListaAdjuntos proceso={proceso} adjuntos={m.adjuntos} />
            </li>
          ))}
        </ol>
      )}
      <ConAdjuntos borrador={adjuntos} etiqueta={`la respuesta a «${hilo.titulo}»`}>
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={hilo.propuesta ? "Responde o confirma la propuesta" : "Responder"}
          aria-label={`Responder a «${hilo.titulo}»`}
          rows={2}
        />
      </ConAdjuntos>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={enviar} disabled={!texto.trim() || responder.isPending || adjuntos.subiendo}>
          Responder
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={estado.isPending}
          onClick={() =>
            estado.mutate(resuelta ? "abierta" : "resuelta", {
              onError: (e) => toast.error(`No se pudo cambiar el estado: ${mensajeError(e)}`),
            })
          }
        >
          {resuelta ? "Volver a abrir" : "Marcar resuelta"}
        </Button>
      </div>
    </article>
  )
}

function Nuevo({ proceso, pais, ancla }: { proceso: ProcesoConv; pais: string; ancla: Ancla | null }) {
  const [texto, setTexto] = useState("")
  const [tipo, setTipo] = useState<TipoHilo>("comentario")
  const [donde, setDonde] = useState<Ancla>(ancla ?? anclasDe(proceso)[0])
  const [soloPais, setSoloPais] = useState(false)
  const adjuntos = useAdjuntosBorrador(proceso)
  const crear = useAccionConversacion(proceso, (b: Parameters<typeof crearConversacion>[1]) => crearConversacion(proceso, b))
  const destino = ancla ?? donde
  return (
    <form
      className="space-y-2 border-t px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        crear.mutate(
          { ancla: destino, tipo, texto, pais: soloPais ? pais : null, adjuntos: adjuntos.ids },
          {
            onSuccess: () => {
              setTexto("")
              adjuntos.limpiar()
              toast.success(`${TIPOS[tipo]} publicado en ${ANCLAS[destino]}`)
            },
            onError: (err) => toast.error(`No se pudo publicar: ${mensajeError(err)}`),
          },
        )
      }}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold">Nuevo</span>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoHilo)}
          aria-label="Tipo"
          className="h-7 rounded-md border bg-background px-1.5"
        >
          {(Object.keys(TIPOS) as TipoHilo[]).map((t) => (
            <option key={t} value={t}>
              {TIPOS[t]}
            </option>
          ))}
        </select>
        {!ancla && (
          <select
            value={donde}
            onChange={(e) => setDonde(e.target.value as Ancla)}
            aria-label="Sección"
            className="h-7 max-w-56 rounded-md border bg-background px-1.5"
          >
            {anclasDe(proceso).map((a) => (
              <option key={a} value={a}>
                {ANCLAS[a]}
              </option>
            ))}
          </select>
        )}
        <label className="inline-flex items-center gap-1">
          <input type="checkbox" checked={soloPais} onChange={(e) => setSoloPais(e.target.checked)} />
          solo {pais}
        </label>
      </div>
      <ConAdjuntos borrador={adjuntos} etiqueta="el nuevo comentario">
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe una pregunta, un comentario o un problema. La primera línea es el título."
          aria-label="Nuevo comentario"
          rows={3}
        />
      </ConAdjuntos>
      <Button type="submit" size="sm" disabled={!texto.trim() || crear.isPending || adjuntos.subiendo}>
        Publicar
      </Button>
    </form>
  )
}

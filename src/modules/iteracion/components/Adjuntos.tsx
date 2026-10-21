import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { FileText, Loader2, Paperclip, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { mensajeError } from "@/modules/qmstr/components/flujo/formato"
import { ACEPTA, MAX_POR_MENSAJE, tamano, type AdjuntosBorrador } from "../adjuntos"
import { descargarAdjunto } from "../api"
import type { Adjunto, Proceso } from "../types"

/**
 * Envuelve el cuadro de texto: se puede pegar un pantallazo (Ctrl+V), arrastrar archivos o
 * elegirlos con el clip. Debajo se ven los que van a ir con el mensaje.
 */
export function ConAdjuntos({ borrador, children, etiqueta }: { borrador: AdjuntosBorrador; children: ReactNode; etiqueta: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [encima, setEncima] = useState(false)
  const pegar = (e: ClipboardEvent<HTMLDivElement>) => {
    const archivos = [...e.clipboardData.files]
    if (!archivos.length) return // texto: se pega normal
    e.preventDefault()
    borrador.agregar(archivos)
  }
  const soltar = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setEncima(false)
    borrador.agregar([...e.dataTransfer.files])
  }
  return (
    <div
      onPaste={pegar}
      onDragOver={(e) => {
        if ([...e.dataTransfer.types].includes("Files")) {
          e.preventDefault()
          setEncima(true)
        }
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={soltar}
      className={cn("space-y-1.5 rounded-md", encima && "ring-2 ring-ring ring-offset-2 ring-offset-background")}
    >
      {children}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={() => input.current?.click()}
          disabled={borrador.items.length >= MAX_POR_MENSAJE}
          aria-label={`Adjuntar archivo a ${etiqueta}`}
        >
          <Paperclip aria-hidden /> Adjuntar
        </Button>
        <span className="text-xs text-muted-foreground">o pega un pantallazo / arrastra archivos</span>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACEPTA}
          className="hidden"
          data-testid="it-adjuntar-input"
          onChange={(e) => {
            borrador.agregar([...(e.target.files ?? [])])
            e.target.value = ""
          }}
        />
      </div>
      {borrador.items.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Archivos que se van a enviar">
          {borrador.items.map((i) => (
            <li key={i.clave} className="relative" data-testid="it-adjunto-borrador">
              {i.url ? (
                <img src={i.url} alt={i.archivo.name} className="size-16 rounded-md border object-cover" />
              ) : (
                <span className="flex h-16 max-w-48 items-center gap-1.5 rounded-md border px-2 text-xs">
                  <FileText className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{i.archivo.name}</span>
                </span>
              )}
              {!i.subido && (
                <span className="absolute inset-0 flex items-center justify-center rounded-md bg-background/60" aria-label="Subiendo">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                </span>
              )}
              <button
                type="button"
                onClick={() => borrador.quitar(i.clave)}
                className="absolute -top-1.5 -right-1.5 rounded-full border bg-background p-0.5 hover:bg-accent"
                aria-label={`Quitar ${i.archivo.name}`}
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** El archivo de un adjunto como URL local (la descarga va con la sesión). */
function useBlobUrl(proceso: Proceso, a: Adjunto, enabled: boolean) {
  const q = useQuery({
    queryKey: ["iteracion", proceso, "adjunto", a.id],
    queryFn: () => descargarAdjunto(proceso, a.id),
    enabled,
    staleTime: Infinity,
  })
  const url = useMemo(() => (q.data ? URL.createObjectURL(q.data) : null), [q.data])
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url)
  }, [url])
  return { url, error: q.error }
}

/** Adjuntos ya enviados: imágenes en miniatura (se abren en grande) y archivos para descargar. */
export function ListaAdjuntos({ proceso, adjuntos }: { proceso: Proceso; adjuntos: Adjunto[] }) {
  const [grande, setGrande] = useState<Adjunto | null>(null)
  if (!adjuntos.length) return null
  return (
    <>
      <ul className="flex flex-wrap gap-2" aria-label="Adjuntos">
        {adjuntos.map((a) =>
          a.imagen ? (
            <li key={a.id}>
              <Miniatura proceso={proceso} a={a} onAbrir={() => setGrande(a)} />
            </li>
          ) : (
            <li key={a.id}>
              <Descarga proceso={proceso} a={a} />
            </li>
          ),
        )}
      </ul>
      <Dialog open={!!grande} onOpenChange={(o) => !o && setGrande(null)}>
        <DialogContent className="max-h-[92vh] sm:max-w-[min(1200px,92vw)]">
          {grande && <ImagenGrande proceso={proceso} a={grande} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function Miniatura({ proceso, a, onAbrir }: { proceso: Proceso; a: Adjunto; onAbrir: () => void }) {
  const { url, error } = useBlobUrl(proceso, a, true)
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="block size-20 overflow-hidden rounded-md border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      title={`${a.nombre} · ${tamano(a.tamano)} · clic para ver en grande`}
      data-testid={`it-adjunto-${a.id}`}
    >
      {url ? (
        <img src={url} alt={a.nombre} className="size-full object-cover" />
      ) : error ? (
        <span className="p-1 text-[10px] text-destructive">No se pudo cargar</span>
      ) : (
        <Loader2 className="m-auto size-4 animate-spin" aria-hidden />
      )}
    </button>
  )
}

function ImagenGrande({ proceso, a }: { proceso: Proceso; a: Adjunto }) {
  const { url } = useBlobUrl(proceso, a, true)
  return (
    <div className="space-y-2">
      <DialogTitle className="text-sm">{a.nombre}</DialogTitle>
      <DialogDescription className="sr-only">Imagen adjunta en tamaño completo</DialogDescription>
      {url ? (
        <img src={url} alt={a.nombre} className="max-h-[78vh] w-full object-contain" />
      ) : (
        <Loader2 className="mx-auto size-5 animate-spin" aria-hidden />
      )}
      {url && (
        <a href={url} download={a.nombre} className="text-xs underline">
          Descargar ({tamano(a.tamano)})
        </a>
      )}
    </div>
  )
}

function Descarga({ proceso, a }: { proceso: Proceso; a: Adjunto }) {
  const [bajando, setBajando] = useState(false)
  const bajar = async () => {
    setBajando(true)
    try {
      const blob = await descargarAdjunto(proceso, a.id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = a.nombre
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast.error(`No se pudo descargar «${a.nombre}»`, { description: mensajeError(e) })
    } finally {
      setBajando(false)
    }
  }
  return (
    <button
      type="button"
      onClick={bajar}
      disabled={bajando}
      className="flex max-w-64 items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-xs hover:bg-accent"
      title={`Descargar ${a.nombre}`}
      data-testid={`it-adjunto-${a.id}`}
    >
      {bajando ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : <FileText className="size-4 shrink-0" aria-hidden />}
      <span className="min-w-0">
        <span className="block truncate font-medium">{a.nombre}</span>
        <span className="text-muted-foreground">{tamano(a.tamano)}</span>
      </span>
    </button>
  )
}

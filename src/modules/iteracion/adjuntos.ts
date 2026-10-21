// Archivos que acompañan una pregunta o comentario: borrador (se sube al agregarlo) y formato.
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { mensajeError } from "@/modules/qmstr/components/flujo/formato"
import { subirAdjunto } from "./api"
import type { Adjunto, ProcesoConv } from "./types"

// Los mismos límites que valida la API (iteracion/conversaciones.py).
const MAX_MB = 10
export const MAX_POR_MENSAJE = 5
const EXTENSIONES = ["png", "jpg", "jpeg", "gif", "webp", "pdf", "xlsx", "docx", "csv", "txt"]
export const ACEPTA = EXTENSIONES.map((e) => `.${e}`).join(",")

export const tamano = (b: number) =>
  b < 1024 * 1024
    ? `${Math.max(1, Math.round(b / 1024)).toLocaleString("es-CL")} KB`
    : `${(b / (1024 * 1024)).toLocaleString("es-CL", { maximumFractionDigits: 1 })} MB`

interface Borrador {
  clave: string
  archivo: File
  /** Vista previa local de una imagen (antes de que termine de subir). */
  url: string | null
  subido: Adjunto | null
}

/** Archivos que se van a enviar con un mensaje: se suben al agregarlos y se envían por id. */
export function useAdjuntosBorrador(proceso: ProcesoConv) {
  const [items, setItems] = useState<Borrador[]>([])
  const vivos = useRef(items)
  useEffect(() => {
    vivos.current = items
  }, [items])
  // libera las vistas previas al desmontar
  useEffect(() => () => vivos.current.forEach((i) => i.url && URL.revokeObjectURL(i.url)), [])

  const agregar = (archivos: File[]) => {
    const espacio = MAX_POR_MENSAJE - items.length
    if (archivos.length > espacio) toast.error(`Se pueden adjuntar hasta ${MAX_POR_MENSAJE} archivos por mensaje`)
    for (const original of archivos.slice(0, Math.max(0, espacio))) {
      // un pantallazo pegado llega como «image.png»: se le pone un nombre que se entienda
      const archivo =
        original.name === "image.png" || !original.name
          ? new File([original], `pantallazo ${new Date().toLocaleTimeString("es-CL", { hourCycle: "h23" }).replaceAll(":", "-")}.png`, { type: original.type })
          : original
      const ext = archivo.name.split(".").pop()?.toLowerCase() ?? ""
      if (!EXTENSIONES.includes(ext)) {
        toast.error(`«${archivo.name}»: tipo no permitido`, { description: `Se aceptan ${EXTENSIONES.filter((e) => e !== "jpeg").join(", ")}.` })
        continue
      }
      if (archivo.size > MAX_MB * 1024 * 1024) {
        toast.error(`«${archivo.name}» pesa más de ${MAX_MB} MB`)
        continue
      }
      const clave = crypto.randomUUID()
      const url = archivo.type.startsWith("image/") ? URL.createObjectURL(archivo) : null
      setItems((xs) => [...xs, { clave, archivo, url, subido: null }])
      subirAdjunto(proceso, archivo).then(
        (a) => setItems((xs) => xs.map((x) => (x.clave === clave ? { ...x, subido: a } : x))),
        (e) => {
          toast.error(`No se pudo adjuntar «${archivo.name}»`, { description: mensajeError(e) })
          quitar(clave)
        },
      )
    }
  }
  const quitar = (clave: string) =>
    setItems((xs) => {
      const x = xs.find((i) => i.clave === clave)
      if (x?.url) URL.revokeObjectURL(x.url)
      return xs.filter((i) => i.clave !== clave)
    })
  const limpiar = () =>
    setItems((xs) => {
      xs.forEach((x) => x.url && URL.revokeObjectURL(x.url))
      return []
    })
  return {
    items,
    agregar,
    quitar,
    limpiar,
    subiendo: items.some((i) => !i.subido),
    ids: items.flatMap((i) => (i.subido ? [i.subido.id] : [])),
  }
}

export type AdjuntosBorrador = ReturnType<typeof useAdjuntosBorrador>

import { api } from "@/lib/api"
import type {
  Adjunto,
  Ajustes,
  Ancla,
  EstadoHilo,
  Hilo,
  TipoHilo,
  Escenario,
  Escenarios,
  PaisIteracion,
  Parametros,
  Preparacion,
  Proceso,
  ProcesoConv,
  Publicacion,
  Simulacion,
  ValoresParametros,
} from "./types"

const base = (proceso: Proceso, pais: string, periodo: string) => `/iteracion/${proceso}/${pais}/${periodo}`

export const getPaises = (proceso: Proceso) =>
  api.get<{ paises: PaisIteracion[] }>(`/iteracion/${proceso}/paises`).then((r) => r.data.paises)

export const getPreparacion = (proceso: Proceso, pais: string, periodo: string) =>
  api.get<Preparacion>(`${base(proceso, pais, periodo)}/preparacion`).then((r) => r.data)

export const prepararDatos = (proceso: Proceso, pais: string, periodo: string) =>
  api.post<Preparacion>(`${base(proceso, pais, periodo)}/preparacion`).then((r) => r.data)

export const getParametros = (proceso: Proceso, pais: string, periodo: string) =>
  api.get<Parametros>(`${base(proceso, pais, periodo)}/parametros`).then((r) => r.data)

/**
 * Con el proceso real la API puede responder 202 («calculando»): la corrida sigue en segundo plano
 * (puede pasar los 230 s que el App Service da por pedido). Se repite el mismo pedido hasta tener
 * el resultado; `onEspera` informa los segundos que lleva.
 */
export async function simular(
  proceso: Proceso,
  pais: string,
  periodo: string,
  body: { parametros: ValoresParametros; ajustes: Ajustes },
  onEspera?: (segundos: number) => void,
): Promise<Simulacion> {
  for (;;) {
    const r = await api.post<Simulacion | { estado: "calculando"; segundos: number }>(
      `${base(proceso, pais, periodo)}/simulacion`,
      body,
    )
    if (r.status !== 202) return r.data as Simulacion
    onEspera?.((r.data as { segundos: number }).segundos)
    await new Promise((ok) => setTimeout(ok, 3_000))
  }
}

export const getEscenarios = (proceso: Proceso, pais: string, periodo: string) =>
  api.get<Escenarios>(`${base(proceso, pais, periodo)}/escenarios`).then((r) => r.data)

export const crearEscenario = (
  proceso: Proceso,
  pais: string,
  periodo: string,
  body: { nombre: string; parametros: ValoresParametros; ajustes: Ajustes },
) => api.post<Escenario>(`${base(proceso, pais, periodo)}/escenarios`, body).then((r) => r.data)

export const elegirEscenario = (proceso: Proceso, pais: string, periodo: string, id: string) =>
  api
    .post<{ elegido_id: string }>(`${base(proceso, pais, periodo)}/escenarios/${id}/elegir`)
    .then((r) => r.data)

export const getPublicacion = (proceso: Proceso, pais: string, periodo: string) =>
  api.get<Publicacion>(`${base(proceso, pais, periodo)}/publicacion`).then((r) => r.data)

export const enviarPublicacion = (
  proceso: Proceso,
  pais: string,
  periodo: string,
  body: { escenario_id: string; destino?: "sql" | "kronos" },
) => api.post<Publicacion>(`${base(proceso, pais, periodo)}/publicacion/enviar`, body).then((r) => r.data)

export const aprobarPublicacion = (proceso: Proceso, pais: string, periodo: string) =>
  api.post<Publicacion>(`${base(proceso, pais, periodo)}/publicacion/aprobar`).then((r) => r.data)

export const devolverPublicacion = (proceso: Proceso, pais: string, periodo: string, comentario: string) =>
  api
    .post<Publicacion>(`${base(proceso, pais, periodo)}/publicacion/devolver`, { comentario })
    .then((r) => r.data)

// ── Conversaciones ──────────────────────────────────────────────────────────────────────────────
const conv = (proceso: ProcesoConv) => `/iteracion/${proceso}/conversaciones`

export const getConversaciones = (proceso: ProcesoConv) =>
  api.get<{ hilos: Hilo[] }>(conv(proceso)).then((r) => r.data.hilos)

export const crearConversacion = (
  proceso: ProcesoConv,
  body: { ancla: Ancla; tipo: TipoHilo; texto: string; pais: string | null; adjuntos: string[] },
) => api.post<Hilo>(conv(proceso), body).then((r) => r.data)

export const responderConversacion = (proceso: ProcesoConv, id: string, texto: string, adjuntos: string[]) =>
  api.post<Hilo>(`${conv(proceso)}/${id}/mensajes`, { texto, adjuntos }).then((r) => r.data)

/** Sube un archivo; queda del autor hasta que lo envía con un mensaje (por su id). */
export const subirAdjunto = (proceso: ProcesoConv, archivo: File) => {
  const form = new FormData()
  form.append("archivo", archivo)
  return api
    .post<Adjunto>(`${conv(proceso)}/adjuntos`, form, { headers: { "Content-Type": "multipart/form-data" } })
    .then((r) => r.data)
}

/** El archivo como blob: la descarga va autenticada, así que no sirve un <img src> directo. */
export const descargarAdjunto = (proceso: ProcesoConv, id: string) =>
  api.get<Blob>(`${conv(proceso)}/adjuntos/${id}`, { responseType: "blob" }).then((r) => r.data)

export const cambiarEstadoConversacion = (proceso: ProcesoConv, id: string, estado: EstadoHilo) =>
  api.patch<Hilo>(`${conv(proceso)}/${id}`, { estado }).then((r) => r.data)

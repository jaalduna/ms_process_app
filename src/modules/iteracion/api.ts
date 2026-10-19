import { api } from "@/lib/api"
import type {
  Ajustes,
  Escenario,
  Escenarios,
  PaisIteracion,
  Parametros,
  Preparacion,
  Proceso,
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

export const simular = (
  proceso: Proceso,
  pais: string,
  periodo: string,
  body: { parametros: ValoresParametros; ajustes: Ajustes },
) => api.post<Simulacion>(`${base(proceso, pais, periodo)}/simulacion`, body).then((r) => r.data)

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

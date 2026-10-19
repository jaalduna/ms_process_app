import { useEffect, useState } from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  aprobarPublicacion,
  crearEscenario,
  devolverPublicacion,
  elegirEscenario,
  enviarPublicacion,
  getEscenarios,
  getPaises,
  getParametros,
  getPreparacion,
  getPublicacion,
  prepararDatos,
  simular,
} from "./api"
import type { Ajustes, Proceso, Publicacion, ValoresParametros } from "./types"

/** Identifica el cierre sobre el que se trabaja: proceso + país + período. */
export interface Cierre {
  proceso: Proceso
  pais: string
  periodo: string
}

const key = (c: Cierre, parte: string) => ["iteracion", c.proceso, c.pais, c.periodo, parte] as const

export function usePaises(proceso: Proceso) {
  return useQuery({ queryKey: ["iteracion", proceso, "paises"], queryFn: () => getPaises(proceso), staleTime: 10 * 60_000 })
}

/** Mientras se prepara, se vuelve a leer cada 2 s hasta que queda lista (o falla). */
export function usePreparacion(c: Cierre) {
  return useQuery({
    queryKey: key(c, "preparacion"),
    queryFn: () => getPreparacion(c.proceso, c.pais, c.periodo),
    enabled: !!c.pais,
    refetchInterval: (q) => (q.state.data?.estado === "preparando" ? 2_000 : false),
  })
}

export function usePrepararDatos(c: Cierre) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => prepararDatos(c.proceso, c.pais, c.periodo),
    onSuccess: (data) => qc.setQueryData(key(c, "preparacion"), data),
  })
}

export function useParametros(c: Cierre, enabled: boolean) {
  return useQuery({
    queryKey: key(c, "parametros"),
    queryFn: () => getParametros(c.proceso, c.pais, c.periodo),
    enabled: enabled && !!c.pais,
  })
}

/** Devuelve `valor` recién cuando dejó de cambiar por `ms` (para no simular en cada paso de un slider). */
export function useDebounced<T>(valor: T, ms: number): T {
  const [estable, setEstable] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setEstable(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return estable
}

/**
 * Simulación sobre el silver ya preparado. Es una lectura pura de (parámetros, ajustes), así que va
 * como query: cada combinación queda en caché y volver a una ya vista es instantáneo. Mientras se
 * recalcula se sigue mostrando el resultado anterior.
 */
export function useSimulacion(
  c: Cierre,
  entrada: { parametros: ValoresParametros; ajustes: Ajustes } | null,
) {
  const estable = useDebounced(entrada, 350)
  return useQuery({
    queryKey: [...key(c, "simulacion"), estable],
    queryFn: () => simular(c.proceso, c.pais, c.periodo, estable!),
    enabled: !!estable,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    retry: false,
  })
}

export function useEscenarios(c: Cierre, enabled: boolean) {
  return useQuery({
    queryKey: key(c, "escenarios"),
    queryFn: () => getEscenarios(c.proceso, c.pais, c.periodo),
    enabled: enabled && !!c.pais,
  })
}

export function useCrearEscenario(c: Cierre) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { nombre: string; parametros: ValoresParametros; ajustes: Ajustes }) =>
      crearEscenario(c.proceso, c.pais, c.periodo, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(c, "escenarios") }),
  })
}

export function useElegirEscenario(c: Cierre) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => elegirEscenario(c.proceso, c.pais, c.periodo, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(c, "escenarios") })
      // Elegir otro escenario puede devolver un envío pendiente a borrador.
      qc.invalidateQueries({ queryKey: key(c, "publicacion") })
    },
  })
}

export function usePublicacion(c: Cierre, enabled: boolean) {
  return useQuery({
    queryKey: key(c, "publicacion"),
    queryFn: () => getPublicacion(c.proceso, c.pais, c.periodo),
    enabled: enabled && !!c.pais,
  })
}

type AccionPublicacion =
  | { tipo: "enviar"; escenario_id: string; destino?: "sql" | "kronos" }
  | { tipo: "aprobar" }
  | { tipo: "devolver"; comentario: string }

export function useAccionPublicacion(c: Cierre) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: AccionPublicacion): Promise<Publicacion> => {
      if (a.tipo === "enviar") {
        return enviarPublicacion(c.proceso, c.pais, c.periodo, { escenario_id: a.escenario_id, destino: a.destino })
      }
      if (a.tipo === "aprobar") return aprobarPublicacion(c.proceso, c.pais, c.periodo)
      return devolverPublicacion(c.proceso, c.pais, c.periodo, a.comentario)
    },
    onSuccess: (data) => {
      qc.setQueryData(key(c, "publicacion"), data)
      // Pesaje depende de que Elegibilidad del mismo cierre esté publicada.
      qc.invalidateQueries({ queryKey: ["iteracion", "pesaje", c.pais, c.periodo, "preparacion"] })
    },
  })
}

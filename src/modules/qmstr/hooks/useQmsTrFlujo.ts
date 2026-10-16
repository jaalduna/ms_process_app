import { useEffect, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  accionTanda,
  crearTanda,
  decidirRevision,
  forzarVuelta,
  getFlujoBases,
  getFlujoAvisos,
  getFlujoEstado,
  getFlujoPaises,
  getFlujoPeriodos,
  getTandaProgreso,
  getTandas,
  revertirTanda,
  type AccionTanda,
} from "../api"
import { TANDA_ACTIVOS, type Tanda, type TandaCreate, type TandaDecisionCreate, type TandaRevertir } from "../types"

const KEY = ["qmstr_flujo"] as const

/** Polling del tablero: 10 s con tandas avanzando solas; 60 s si todo está quieto (el loop corre cada 5 min). */
export function pollTandas(tandas: Tanda[] | undefined): number {
  if (tandas?.some((t) => TANDA_ACTIVOS.includes(t.estado) && !t.pausada)) return 10_000
  return 60_000
}

/**
 * Estado del loop: se vuelve a leer cada 60 s y al volver a la pestaña. Cuando `ultima_vuelta` cambia, el loop acaba
 * de mirar los hitos: se invalidan las listas que dependen de él (períodos, tandas, bases, avisos).
 */
export function useFlujoEstado() {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: [...KEY, "estado"],
    queryFn: getFlujoEstado,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
  const vuelta = q.data?.ultima_vuelta
  const previa = useRef(vuelta)
  useEffect(() => {
    if (previa.current === vuelta) return
    const habia = previa.current !== undefined
    previa.current = vuelta
    if (!habia) return // primera lectura: las listas se cargan solas
    for (const k of ["periodos", "tandas", "bases", "avisos"]) qc.invalidateQueries({ queryKey: [...KEY, k] })
  }, [vuelta, qc])
  return q
}

export function useFlujoPaises() {
  return useQuery({ queryKey: [...KEY, "paises"], queryFn: getFlujoPaises, staleTime: 10 * 60_000 })
}

export function useFlujoPeriodos(pais: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "periodos", pais],
    queryFn: () => getFlujoPeriodos(pais!),
    enabled: !!pais,
  })
}

export function useFlujoTandas(pais: string | undefined, periodo: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "tandas", pais, periodo],
    queryFn: () => getTandas({ pais, periodo }),
    enabled: !!pais && !!periodo,
    refetchInterval: (q) => pollTandas(q.state.data),
  })
}

export function useFlujoBases(pais: string | undefined, periodo: string | undefined, vivo: boolean) {
  return useQuery({
    queryKey: [...KEY, "bases", pais, periodo],
    queryFn: () => getFlujoBases(pais!, periodo!),
    enabled: !!pais && !!periodo,
    refetchInterval: vivo ? 10_000 : 60_000,
  })
}

/** Progreso Databricks de la corrida de una tanda: polling cada 10 s mientras está corriendo. */
export function useTandaProgreso(tanda: Tanda) {
  const corriendo = tanda.estado === "corriendo" && !tanda.pausada
  return useQuery({
    // `corriendo` va en la llave: al terminar la corrida se pide el progreso final una vez, en vez de quedarse con
    // la última lectura en vivo (que puede ser de hasta 10 s antes del fin, p. ej. "24 de 26 productos").
    queryKey: [...KEY, "progreso", tanda.id, corriendo],
    queryFn: () => getTandaProgreso(tanda.id),
    enabled: tanda.tipo !== "reversion" && !!tanda.qms_run_id && !tanda.progreso,
    refetchInterval: corriendo ? 10_000 : false,
    staleTime: corriendo ? 0 : 5 * 60_000,
  })
}

export function useFlujoAvisos(pais: string | undefined, periodo: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "avisos", pais, periodo],
    queryFn: () => getFlujoAvisos(pais!, periodo!),
    enabled: !!pais && !!periodo,
    refetchInterval: 30_000,
  })
}

function useInvalidar() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: KEY })
}

export function useCrearTanda() {
  const invalidar = useInvalidar()
  return useMutation({ mutationFn: (d: TandaCreate) => crearTanda(d), onSuccess: invalidar })
}

export function useRevertirTanda() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: ({ tid, ...d }: TandaRevertir & { tid: string }) => revertirTanda(tid, d),
    onSuccess: invalidar,
  })
}

/**
 * Decide una base observada en la revisión antes del ticket. Con la última decidida se fuerza una vuelta para que el
 * ticket salga ya y no en la vuelta siguiente (hasta 5 min); si ya hay una vuelta en curso, esa misma lo envía.
 */
export function useDecidirRevision() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: ({ tid, ...d }: TandaDecisionCreate & { tid: string }) => decidirRevision(tid, d),
    onSuccess: (t) => {
      if (t.revisar.every((r) => String(r.producto) in t.revision)) {
        void forzarVuelta().catch(() => undefined).finally(invalidar)
      }
      return invalidar()
    },
  })
}

export function useAccionTanda() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: ({ tid, accion }: { tid: string; accion: AccionTanda }) => accionTanda(tid, accion),
    onSuccess: invalidar,
  })
}

export function useForzarVuelta() {
  const invalidar = useInvalidar()
  return useMutation({ mutationFn: forzarVuelta, onSuccess: invalidar })
}

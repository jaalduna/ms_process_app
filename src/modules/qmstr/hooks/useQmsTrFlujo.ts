import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  accionTanda,
  crearTanda,
  forzarVuelta,
  getFlujoBases,
  getFlujoCorreos,
  getFlujoEstado,
  getFlujoPaises,
  getFlujoPeriodos,
  getTandaProgreso,
  getTandas,
  revertirTanda,
  type AccionTanda,
} from "../api"
import { TANDA_ACTIVOS, type Tanda, type TandaCreate, type TandaRevertir } from "../types"

const KEY = ["qmstr_flujo"] as const

/** Polling del tablero: 10 s con tandas avanzando solas; 60 s si todo está quieto (el loop corre cada 5 min). */
export function pollTandas(tandas: Tanda[] | undefined): number {
  if (tandas?.some((t) => TANDA_ACTIVOS.includes(t.estado) && !t.pausada)) return 10_000
  return 60_000
}

export function useFlujoEstado() {
  return useQuery({ queryKey: [...KEY, "estado"], queryFn: getFlujoEstado, refetchInterval: 60_000 })
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
    queryKey: [...KEY, "progreso", tanda.id],
    queryFn: () => getTandaProgreso(tanda.id),
    enabled: tanda.tipo !== "reversion" && !!tanda.qms_run_id,
    refetchInterval: corriendo ? 10_000 : false,
    staleTime: corriendo ? 0 : 5 * 60_000,
  })
}

export function useFlujoCorreos(pais: string | undefined, periodo: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "correos", pais, periodo],
    queryFn: () => getFlujoCorreos(pais!, periodo!),
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

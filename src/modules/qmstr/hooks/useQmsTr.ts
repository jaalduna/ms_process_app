import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  cancelQmsTrRun,
  createQmsTrRun,
  getQmsTrRuns,
  resolveQmsTrSnapshot,
  validateQmsTrRun,
} from "../api"
import type { QmsTrRun, QmsTrRunCreate } from "../types"

const RUNS_KEY = ["qms_tr", "runs"] as const

/** Intervalo de polling: 3 s con corridas en curso; 30 s si solo hay corridas esperando el
 * snapshot (el CDC de J es horario, la API ni siquiera consulta Databricks antes del ciclo). */
export function pollInterval(runs: QmsTrRun[] | undefined): number | false {
  if (!runs) return false
  if (runs.some((r) => r.status === "pending" || r.status === "running")) return 3000
  if (runs.some((r) => r.status === "waiting_snapshot")) return 30_000
  return false
}

export function useQmsTrRuns() {
  return useQuery({
    queryKey: RUNS_KEY,
    queryFn: () => getQmsTrRuns({ limit: 100 }),
    select: (data) => data.items,
    refetchInterval: (query) => pollInterval(query.state.data?.items),
  })
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

/** Snapshot que usaría una corrida con este país + instante (ISO con zona). */
export function useQmsTrSnapshot(country: string | undefined, at: string | undefined) {
  const atDebounced = useDebounced(at, 400)
  return useQuery({
    queryKey: ["qms_tr", "snapshot", country, atDebounced],
    queryFn: () => resolveQmsTrSnapshot(country!, atDebounced!),
    enabled: !!country && !!atDebounced,
    staleTime: 60_000,
    retry: false,
  })
}

export function useCreateQmsTrRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: QmsTrRunCreate) => createQmsTrRun(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: RUNS_KEY }),
  })
}

export function useCancelQmsTrRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => cancelQmsTrRun(runId),
    onSuccess: () => qc.invalidateQueries({ queryKey: RUNS_KEY }),
  })
}

export function useValidateQmsTrRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => validateQmsTrRun(runId),
    onSuccess: () => qc.invalidateQueries({ queryKey: RUNS_KEY }),
  })
}

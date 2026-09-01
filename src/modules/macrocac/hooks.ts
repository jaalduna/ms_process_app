// JAA-1051 — react-query hooks for the macrocac upload/run flow.

import { useMutation, useQuery } from "@tanstack/react-query"
import {
  createMacrocacRun,
  downloadMacrocacReporte,
  downloadPlantilla,
  getMacrocacRun,
  getMotivos,
  getTablas,
  uploadMacrocacFile,
} from "./api"
import { isTerminal } from "./types"

export function useUploadMacrocac() {
  return useMutation({ mutationFn: uploadMacrocacFile })
}

export function useCreateMacrocacRun() {
  return useMutation({ mutationFn: createMacrocacRun })
}

/** Intervalo de polling del estado del run, en ms. */
const RUN_POLL_INTERVAL_MS = 1500

/**
 * Sigue el estado de un run hasta que termina.
 *
 * `POST /runs` devuelve el run en `running` y la ejecución sigue en un hilo del
 * backend, así que sin polling la UI se quedaría mostrando "running" para
 * siempre. Se detiene al llegar a un estado terminal para no dejar un timer vivo.
 */
export function useMacrocacRun(runId: string | null) {
  return useQuery({
    queryKey: ["macrocac", "run", runId],
    queryFn: () => getMacrocacRun(runId as string),
    enabled: runId !== null,
    refetchInterval: (query) =>
      isTerminal(query.state.data?.status) ? false : RUN_POLL_INTERVAL_MS,
  })
}

export function useDownloadReporte() {
  return useMutation({ mutationFn: downloadMacrocacReporte })
}

/**
 * Descarga de la plantilla. Es una mutación y no un `onClick` suelto porque
 * desde JAA-757 la descarga pide primero una URL firmada al backend: puede
 * fallar (401, red) y ese error tiene que llegar a la pantalla, no morir en una
 * promesa sin dueño.
 */
export function useDownloadPlantilla() {
  return useMutation({ mutationFn: downloadPlantilla })
}

/**
 * Catálogo de motivos del país. Doble caché a propósito:
 *
 *  - el backend cachea la lectura de SQL (TTL de horas), para no cruzar de
 *    Azure al SQL on-prem en cada request;
 *  - react-query cachea la respuesta en el browser, para no pedirla de nuevo al
 *    cambiar de país y volver.
 *
 * `staleTime` largo porque es una tabla de 9 filas que casi no cambia; si algún
 * día hace falta refrescar sin recargar, alcanza con invalidar esta query.
 */
const MOTIVOS_STALE_MS = 60 * 60 * 1000

export function useMotivos(pais: string) {
  return useQuery({
    queryKey: ["macrocac", "motivos", pais],
    queryFn: () => getMotivos(pais),
    staleTime: MOTIVOS_STALE_MS,
    gcTime: MOTIVOS_STALE_MS,
    // El catálogo no cambia porque el usuario cambie de pestaña.
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

/**
 * Tablas disponibles para el país.
 *
 * A diferencia del catálogo de motivos, esto NO se cachea largo: el punto de
 * los patrones es que una tabla recién creada aparezca sola, y un `staleTime`
 * de horas la escondería. Se revalida al volver a la pestaña por la misma razón.
 */
export function useTablas(pais: string) {
  return useQuery({
    queryKey: ["macrocac", "tablas", pais],
    queryFn: () => getTablas(pais),
    // Sin reintento: los errores posibles son configuración (patrones rotos) o
    // SQL caído, y ninguno se arregla solo en un segundo. Vale más mostrar el
    // problema rápido; react-query reintenta igual al remontar o refocalizar.
    retry: false,
  })
}

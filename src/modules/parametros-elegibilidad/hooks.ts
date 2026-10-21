// JAA-547 — react-query hooks for the eligibility-params editor.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getParamsTable, publishParams } from "./api"
import { getTablaVigente, useFuenteConfig } from "@/modules/iteracion/fuenteConfig"
import type { ParamRow, ParamsTableData } from "./types"

export function useParamsTable(table: string, country: string) {
  const f = useFuenteConfig()
  return useQuery({
    queryKey: ["eleg-params", table, country, f?.periodo ?? null],
    queryFn: (): Promise<ParamsTableData> =>
      f
        ? getTablaVigente<ParamRow[]>(f, table).then((r) => {
            if (r.codigo !== country) throw new Error(`La configuración vigente es de ${r.codigo}, no de ${country}`)
            return { country, table, rows: r.contenido, updated_at: r.publicado_en, updated_by: r.publicado_por }
          })
        : getParamsTable(table, country),
    staleTime: 30_000,
  })
}

export function usePublishParams(table: string, country: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rows: ParamRow[]) => publishParams(table, country, rows),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eleg-params", table, country] }),
  })
}

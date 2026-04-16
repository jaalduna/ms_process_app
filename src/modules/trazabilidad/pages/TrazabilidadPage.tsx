import { useState, useCallback } from "react"
import { useSearchParams } from "react-router-dom"
import { Skeleton } from "@/components/ui/skeleton"
import { TagFilters } from "../components/TagFilters"
import { TagTable } from "../components/TagTable"
import { useTags } from "../hooks/useTags"
import type { TagFilters as TagFiltersType } from "../types"

function parseFiltersFromParams(params: URLSearchParams): TagFiltersType {
  const filters: TagFiltersType = {}
  const tag = params.get("tag")
  const tableName = params.get("table_name")
  const excludeSinc = params.get("exclude_sincronizacion")
  if (tag) filters.tag = tag
  if (tableName) filters.table_name = tableName
  // Default to true (exclude sincronizacion) unless explicitly set to "false"
  filters.exclude_sincronizacion = excludeSinc !== "false"
  return filters
}

function filtersToParams(filters: TagFiltersType): Record<string, string> {
  const params: Record<string, string> = {}
  if (filters.tag) params.tag = filters.tag
  if (filters.table_name) params.table_name = filters.table_name
  // Only encode when false (true is the default, omitting it keeps URLs clean)
  if (filters.exclude_sincronizacion === false) params.exclude_sincronizacion = "false"
  return params
}

export function TrazabilidadPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = parseFiltersFromParams(searchParams)
  const [page, setPage] = useState(0)

  const { data, isLoading, isLoadingAll, loadedPageCount, totalPages, error } = useTags(filters, page)

  const handleFiltersChange = useCallback(
    (newFilters: TagFiltersType) => {
      setSearchParams(filtersToParams(newFilters), { replace: true })
      setPage(0)
    },
    [setSearchParams],
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Trazabilidad</h1>
        <p className="text-sm text-muted-foreground">
          Explora tags de pipeline y descarga tablas de cualquier ejecucion historica
        </p>
      </div>

      <TagFilters filters={filters} onChange={handleFiltersChange} />

      {isLoadingAll && !isLoading && (
        <p className="text-xs text-muted-foreground">
          Cargando datos… {loadedPageCount}/{totalPages} páginas
        </p>
      )}

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Error al cargar tags: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && (
        <TagTable
          data={data}
          page={page}
          onPageChange={setPage}
        />
      )}
    </div>
  )
}

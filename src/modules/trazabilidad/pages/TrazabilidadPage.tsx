import { useState, useCallback } from "react"
import { useSearchParams } from "react-router-dom"
import { Skeleton } from "@/components/ui/skeleton"
import { TagFilters } from "../components/TagFilters"
import { TagTable } from "../components/TagTable"
import { TagDetailModal } from "../components/TagDetailModal"
import { useTags } from "../hooks/useTags"
import type { TagFilters as TagFiltersType } from "../types"

function parseFiltersFromParams(params: URLSearchParams): TagFiltersType {
  const filters: TagFiltersType = {}
  const country = params.get("country")
  const stage = params.get("stage")
  const period = params.get("period")
  const dateFrom = params.get("date_from")
  const dateTo = params.get("date_to")
  if (country) filters.country = country
  if (stage) filters.stage = stage
  if (period) filters.period = parseInt(period, 10)
  if (dateFrom) filters.date_from = dateFrom
  if (dateTo) filters.date_to = dateTo
  return filters
}

function filtersToParams(filters: TagFiltersType): Record<string, string> {
  const params: Record<string, string> = {}
  if (filters.country) params.country = filters.country
  if (filters.stage) params.stage = filters.stage
  if (filters.period) params.period = String(filters.period)
  if (filters.date_from) params.date_from = filters.date_from
  if (filters.date_to) params.date_to = filters.date_to
  return params
}

export function TrazabilidadPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = parseFiltersFromParams(searchParams)
  const [page, setPage] = useState(0)
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)

  const { data, isLoading, error } = useTags(filters, page)

  const handleFiltersChange = useCallback(
    (newFilters: TagFiltersType) => {
      setSearchParams(filtersToParams(newFilters), { replace: true })
      setPage(0) // Reset to first page on filter change
    },
    [setSearchParams],
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Trazabilidad</h1>
        <p className="text-sm text-muted-foreground">
          Explora tags de pipeline y descarga tablas de cualquier ejecucion historica
        </p>
      </div>

      {/* Filters */}
      <TagFilters filters={filters} onChange={handleFiltersChange} />

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Error al cargar tags: {(error as Error).message}
        </div>
      )}

      {/* Table */}
      {!isLoading && !error && (
        <TagTable
          data={data}
          page={page}
          onPageChange={setPage}
          onRowClick={setSelectedTagId}
        />
      )}

      {/* Detail Modal */}
      <TagDetailModal
        tagId={selectedTagId}
        open={selectedTagId !== null}
        onClose={() => setSelectedTagId(null)}
      />
    </div>
  )
}

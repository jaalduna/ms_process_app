import { useQuery, useQueries } from "@tanstack/react-query"
import { useMemo } from "react"
import { getTags } from "@/lib/api"
import type { TagFilters, TagListResponse } from "../types"

/** Backend max per request */
const FETCH_PAGE_SIZE = 200
/** Page size shown in the table */
const CLIENT_PAGE_SIZE = 50

function pageQueryOptions(offset: number) {
  return {
    queryKey: ["traceability-tags-page", offset] as const,
    queryFn: () => getTags({ limit: FETCH_PAGE_SIZE, offset }),
    staleTime: 5 * 60_000,
  }
}

export function useTags(filters: TagFilters, page: number = 0) {
  // 1. Fetch first page → get total count
  const { data: firstPage, isLoading, error } = useQuery(pageQueryOptions(0))

  const totalBackendItems = firstPage?.total ?? 0
  const totalPages = Math.ceil(totalBackendItems / FETCH_PAGE_SIZE)

  // 2. Fire all remaining pages in parallel (browser limits to ~6 concurrent)
  const remainingResults = useQueries({
    queries: Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) =>
      pageQueryOptions((i + 1) * FETCH_PAGE_SIZE)
    ),
  })

  // Count loaded pages to use as memo dependency
  const loadedPageCount =
    (firstPage ? 1 : 0) + remainingResults.filter((r) => r.data !== undefined).length

  // 3. Merge all loaded items (updates as more pages arrive)
  const allItems = useMemo(() => {
    const pages = [firstPage, ...remainingResults.map((r) => r.data)].filter(
      (p): p is TagListResponse => p !== undefined,
    )
    return pages.flatMap((p) => p.items)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedPageCount])

  // 4. Client-side filter + paginate
  const data = useMemo<TagListResponse | undefined>(() => {
    if (!firstPage) return undefined

    let items = allItems

    if (filters.exclude_sincronizacion ?? true) {
      items = items.filter((t) => !t.tag.toLowerCase().includes("sincronizacion"))
    }
    if (filters.tag) {
      const q = filters.tag.toLowerCase()
      items = items.filter((t) => t.tag.toLowerCase().includes(q))
    }
    if (filters.table_name) {
      const q = filters.table_name.toLowerCase()
      items = items.filter((t) => t.table_name.toLowerCase().includes(q))
    }

    const total = items.length
    const offset = page * CLIENT_PAGE_SIZE
    return { items: items.slice(offset, offset + CLIENT_PAGE_SIZE), total, limit: CLIENT_PAGE_SIZE, offset }
  }, [allItems, filters, page, firstPage])

  const isLoadingAll = loadedPageCount < totalPages

  return { data, isLoading, isLoadingAll, loadedPageCount, totalPages, error }
}

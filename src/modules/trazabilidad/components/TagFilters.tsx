import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import type { TagFilters as TagFiltersType } from "../types"

interface TagFiltersProps {
  filters: TagFiltersType
  onChange: (filters: TagFiltersType) => void
}

export function TagFilters({ filters, onChange }: TagFiltersProps) {
  // Local state keeps inputs responsive; debounced value propagates to parent
  const [localTag, setLocalTag] = useState(filters.tag ?? "")
  const [localTable, setLocalTable] = useState(filters.table_name ?? "")

  // Sync local state when filters change externally (e.g. URL back/forward)
  useEffect(() => { setLocalTag(filters.tag ?? "") }, [filters.tag])
  useEffect(() => { setLocalTable(filters.table_name ?? "") }, [filters.table_name])

  // Debounce text inputs — fire onChange 300 ms after the user stops typing
  useEffect(() => {
    const id = setTimeout(() => {
      onChange({
        ...filters,
        tag: localTag || undefined,
        table_name: localTable || undefined,
      })
    }, 300)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localTag, localTable])

  const excludeSincronizacion = filters.exclude_sincronizacion ?? true

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        placeholder="Filter by tag"
        className="w-[340px]"
        value={localTag}
        onChange={(e) => setLocalTag(e.target.value)}
      />
      <Input
        placeholder="Filter by table name"
        className="w-[240px]"
        value={localTable}
        onChange={(e) => setLocalTable(e.target.value)}
      />
      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
        <Checkbox
          checked={excludeSincronizacion}
          onCheckedChange={(checked) =>
            onChange({ ...filters, exclude_sincronizacion: checked === true })
          }
        />
        Ocultar sincronización
      </label>
    </div>
  )
}

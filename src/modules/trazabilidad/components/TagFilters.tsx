import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { useCountries } from "@/hooks/useCountries"
import { useQuery } from "@tanstack/react-query"
import { getStages } from "@/lib/api"
import type { TagFilters as TagFiltersType } from "../types"

interface TagFiltersProps {
  filters: TagFiltersType
  onChange: (filters: TagFiltersType) => void
}

export function TagFilters({ filters, onChange }: TagFiltersProps) {
  const { data: countriesData } = useCountries()
  const { data: stagesData } = useQuery({
    queryKey: ["stages"],
    queryFn: getStages,
    staleTime: 5 * 60 * 1000,
  })

  const countries = countriesData?.countries.filter(c => c.type === "country") ?? []
  const stages = stagesData?.stages ?? []

  function update(patch: Partial<TagFiltersType>) {
    onChange({ ...filters, ...patch })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Country */}
      <Select
        value={filters.country ?? "__all__"}
        onValueChange={(v) => update({ country: v === "__all__" ? undefined : v })}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Country" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All countries</SelectItem>
          {countries.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              {c.code.charAt(0).toUpperCase() + c.code.slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Stage */}
      <Select
        value={filters.stage ?? "__all__"}
        onValueChange={(v) => update({ stage: v === "__all__" ? undefined : v })}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Stage" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All stages</SelectItem>
          {stages.map((s) => (
            <SelectItem key={s.code} value={s.code}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Period */}
      <Input
        type="number"
        placeholder="Period (YYYYMM)"
        className="w-[160px]"
        value={filters.period ?? ""}
        onChange={(e) => {
          const val = e.target.value
          update({ period: val ? parseInt(val, 10) : undefined })
        }}
      />

      {/* Date From */}
      <Input
        type="date"
        className="w-[160px]"
        value={filters.date_from ?? ""}
        onChange={(e) => update({ date_from: e.target.value || undefined })}
      />

      {/* Date To */}
      <Input
        type="date"
        className="w-[160px]"
        value={filters.date_to ?? ""}
        onChange={(e) => update({ date_to: e.target.value || undefined })}
      />
    </div>
  )
}

import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { COUNTRY_FLAGS } from "@/lib/countries"
import { useRunningCalibrations } from "../hooks/useCalibration"

interface RunningCountriesChipProps {
  period: string
}

/** Page-header chip: "N en ejecución" + flags, hidden when nothing is running (JAA-776). */
export function RunningCountriesChip({ period }: RunningCountriesChipProps) {
  const { data } = useRunningCalibrations(period)
  const running = data ?? []

  if (running.length === 0) return null

  const flags = running.map((r) => COUNTRY_FLAGS[r.country] ?? r.country).join(" ")

  return (
    <Badge variant="outline" className="gap-1.5 text-info border-info/30 bg-info/10">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      {running.length} en ejecución {flags}
    </Badge>
  )
}

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Play } from "lucide-react"
import { ProcessStatusBadge } from "@/components/ProcessStatusBadge"
import { COUNTRY_FLAGS, COUNTRY_LABELS } from "@/lib/countries"
import { formatRelativeTime } from "@/lib/utils"
import type { CountryInfo, LastStageCompletionEntry } from "@/types/api"

interface WeightingLaunchPanelProps {
  countries: CountryInfo[]
  period: string
  lastFinalized?: Record<string, LastStageCompletionEntry | undefined>
  /** A run is already active for this country+period — disable relaunching it here. */
  runningCountries: Set<string>
  onLaunch: (countryCode: string) => void
}

/**
 * Single-country launch form (JAA feedback: no more per-country card grid —
 * this replaces it as the "Nueva ejecución" panel, modeled on
 * wp-calibration-app's ExecutionLaunchPanel). Multi-country batch launch
 * stays out of scope for pesaje; pick one country, review params and confirm
 * in the existing "Configurar Pesaje" dialog (WeightingDetailModal), same
 * flow the cards used to open.
 */
export function WeightingLaunchPanel({ countries, period, lastFinalized, runningCountries, onLaunch }: WeightingLaunchPanelProps) {
  // Controlled from the first render (empty string, not null/undefined) —
  // Select would otherwise flip uncontrolled→controlled on the first pick.
  const [countryCode, setCountryCode] = useState<string>("")
  const isRunning = countryCode ? runningCountries.has(countryCode) : false
  const countryLabel = countryCode ? (COUNTRY_LABELS[countryCode] ?? countryCode) : null
  const lastEntry = countryCode ? lastFinalized?.[countryCode] : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ejecutar Pesaje</CardTitle>
        <p className="text-xs text-muted-foreground">
          Selecciona un pais para revisar sus parametros y lanzar el pipeline de pesaje.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Pais
          </p>
          <Select value={countryCode} onValueChange={setCountryCode}>
            <SelectTrigger className="w-full" aria-label="Pais a ejecutar">
              <SelectValue placeholder="Selecciona un pais" />
            </SelectTrigger>
            <SelectContent>
              {countries.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {COUNTRY_FLAGS[c.code] ?? ""} {COUNTRY_LABELS[c.code] ?? c.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {countryCode && (
          <div className="space-y-2 rounded-lg border p-3">
            <ProcessStatusBadge stage="pesaje" country={countryCode} countryLabel={countryLabel!} showAttribution={false} />
            <p className="text-xs text-muted-foreground">
              Ultima corrida completada:{" "}
              {lastEntry?.completed_at ? formatRelativeTime(lastEntry.completed_at) : "sin ejecuciones"}
            </p>
            {isRunning && (
              <p className="text-xs font-medium text-info">Ya hay una corrida en curso para este pais y periodo.</p>
            )}
          </div>
        )}

        <Button
          className="w-full"
          disabled={!countryCode || isRunning}
          onClick={() => countryCode && onLaunch(countryCode)}
        >
          <Play className="size-4" />
          {countryCode ? `Configurar y ejecutar (${countryLabel})` : "Configurar y ejecutar"}
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">Periodo {period}</p>
      </CardContent>
    </Card>
  )
}

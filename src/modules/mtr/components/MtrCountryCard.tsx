import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const COUNTRY_FLAGS: Record<string, string> = {
  argentina: "\u{1F1E6}\u{1F1F7}",
  bolivia: "\u{1F1E7}\u{1F1F4}",
  brasil: "\u{1F1E7}\u{1F1F7}",
  brazil: "\u{1F1E7}\u{1F1F7}",
  cam: "\u{1F30E}",
  chile: "\u{1F1E8}\u{1F1F1}",
  colombia: "\u{1F1E8}\u{1F1F4}",
  ecuador: "\u{1F1EA}\u{1F1E8}",
  mexico: "\u{1F1F2}\u{1F1FD}",
  peru: "\u{1F1F5}\u{1F1EA}",
}

const COUNTRY_LABELS: Record<string, string> = {
  argentina: "Argentina",
  bolivia: "Bolivia",
  brasil: "Brasil",
  brazil: "Brasil",
  cam: "CAM",
  chile: "Chile",
  colombia: "Colombia",
  ecuador: "Ecuador",
  mexico: "Mexico",
  peru: "Peru",
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface MtrCountryCardProps {
  countryCode: string
  period: string
  lastMtrDate: string | null
}

/**
 * Stub MtrCountryCard showing country info and last MTR date.
 * The full trigger/progress/cancel flow will be built in JAA-248.
 */
export function MtrCountryCard({ countryCode, lastMtrDate }: MtrCountryCardProps) {
  const countryLabel = COUNTRY_LABELS[countryCode] ?? countryCode
  const flag = COUNTRY_FLAGS[countryCode] ?? ""

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {flag && <span className="mr-1.5">{flag}</span>}
            {countryLabel}
          </CardTitle>
          <Badge
            variant="outline"
            className="text-xs"
            title={lastMtrDate ? `Last MTR: ${lastMtrDate.replace("T", " ").slice(0, 16)}` : undefined}
          >
            {lastMtrDate ? formatRelativeTime(lastMtrDate) : "never"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-xs text-muted-foreground">
          Trigger and progress controls pending (JAA-248)
        </div>
      </CardContent>
    </Card>
  )
}

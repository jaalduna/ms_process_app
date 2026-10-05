import { useMemo, useState } from "react"
import { Loader2, Rocket } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { COUNTRY_FLAGS, COUNTRY_LABELS } from "@/lib/countries"
import { useQmsTrSnapshot } from "../hooks/useQmsTr"
import { chileLocalToIso, formatChile, isoToChileLocal, mesAnterior } from "../time"
import type { QmsTrRunCreate } from "../types"
import { QmsTrSnapshotSummary } from "./QmsTrSnapshotSummary"

interface QmsTrLaunchPanelProps {
  /** Países (códigos) disponibles para el usuario. */
  countries: string[]
  /** País+mes con una corrida activa: no se puede lanzar otra (refuerzo del 409 del backend). */
  busy: Set<string>
  launching: boolean
  canTrigger: boolean
  onLaunch: (data: QmsTrRunCreate) => void
}

export function QmsTrLaunchPanel({ countries, busy, launching, canTrigger, onLaunch }: QmsTrLaunchPanelProps) {
  const [country, setCountry] = useState<string | undefined>(countries.length === 1 ? countries[0] : undefined)
  const [instante, setInstante] = useState(() => isoToChileLocal(new Date().toISOString()))
  const [mes, setMes] = useState(() => mesAnterior(new Date()))
  const [confirmOpen, setConfirmOpen] = useState(false)

  const atIso = useMemo(() => {
    try {
      return chileLocalToIso(instante)
    } catch {
      return undefined
    }
  }, [instante])
  const snapshot = useQmsTrSnapshot(country, atIso)
  const mesValido = /^\d{6}$/.test(mes)
  const ocupado = country ? busy.has(`${country}:${mes}`) : false
  const puedeLanzar = canTrigger && !!country && !!atIso && mesValido && !ocupado && !!snapshot.data && !launching

  function confirmar() {
    setConfirmOpen(false)
    if (!country || !atIso) return
    onLaunch({ country, at: atIso, mes_procesamiento: mes })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Nueva ejecución</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">País</span>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger data-testid="qmstr-country" aria-label="País">
                <SelectValue placeholder="Elige un país" />
              </SelectTrigger>
              <SelectContent>
                {countries.map((c) => (
                  <SelectItem key={c} value={c}>
                    {COUNTRY_FLAGS[c] ?? ""} {COUNTRY_LABELS[c] ?? c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Instante (hora de Chile)</span>
            <Input
              type="datetime-local"
              value={instante}
              onChange={(e) => setInstante(e.target.value)}
              data-testid="qmstr-instante"
              aria-label="Instante"
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Mes de procesamiento</span>
            <Input
              value={mes}
              onChange={(e) => setMes(e.target.value.trim())}
              inputMode="numeric"
              maxLength={6}
              placeholder="AAAAMM"
              aria-invalid={!mesValido}
              data-testid="qmstr-mes"
              aria-label="Mes de procesamiento"
            />
          </label>
        </div>

        <p className="text-xs text-muted-foreground">
          Se usa el primer snapshot de J posterior al instante (el CDC lo guarda cada hora, de 06:00 a 19:00).
        </p>

        {country && snapshot.isFetching && !snapshot.data && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Buscando el snapshot de J…
          </p>
        )}
        {snapshot.isError && (
          <p className="text-sm text-destructive" role="alert">
            No se pudo resolver el snapshot: {(snapshot.error as Error).message}
          </p>
        )}
        {snapshot.data && <QmsTrSnapshotSummary snapshot={snapshot.data} />}
        {ocupado && (
          <p className="text-sm text-muted-foreground">
            Ya hay una corrida en curso para {COUNTRY_LABELS[country!] ?? country} {mes}.
          </p>
        )}

        <div className="flex justify-end">
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={!puedeLanzar}
            title={canTrigger ? undefined : "Requiere rol QMS-TR especialista o admin"}
            data-testid="qmstr-launch"
          >
            {launching ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
            Ejecutar QMS-TR
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Ejecutar QMS-TR?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1">
                <p>
                  {COUNTRY_LABELS[country ?? ""] ?? country} · mes {mes}
                </p>
                <p>
                  {snapshot.data?.status === "ready" && snapshot.data.j
                    ? `Snapshot de J de las ${formatChile(snapshot.data.j.timestamp)} (versión ${snapshot.data.j.version}).`
                    : "La corrida quedará esperando el siguiente snapshot de J."}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmar} data-testid="qmstr-launch-confirm">
              Ejecutar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

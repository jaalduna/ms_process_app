import type { ReactNode } from "react"
import { AlertTriangle, Check, Circle, FlaskConical, X } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { TONO, textoTono, valorKpi } from "../format"
import type { Engine, Kpi, Nivel } from "../types"

/** Aviso permanente cuando los resultados vienen del motor simulado. */
export function AvisoMotor({ engine }: { engine: Engine | undefined }) {
  if (engine !== "simulated") return null
  return (
    <div
      role="note"
      data-testid="it-aviso-simulado"
      className="flex items-start gap-3 rounded-lg border px-4 py-3 text-sm"
      style={{ borderColor: "color-mix(in oklch, var(--warning) 45%, transparent)", background: "color-mix(in oklch, var(--warning) 10%, transparent)" }}
    >
      <FlaskConical className="mt-0.5 size-4 shrink-0" style={textoTono(TONO.aviso)} aria-hidden />
      <p>
        <span className="font-semibold">Datos simulados.</span> Las cifras son ilustrativas y sirven para validar el
        flujo y las vistas. Nada se lee ni se escribe en SQL todavía.
      </p>
    </div>
  )
}

const ICONO: Record<Nivel | "pendiente", ReactNode> = {
  ok: <Check className="size-3.5" aria-hidden />,
  aviso: <AlertTriangle className="size-3.5" aria-hidden />,
  error: <X className="size-3.5" aria-hidden />,
  pendiente: <Circle className="size-3" aria-hidden />,
}
const NIVEL_LABEL: Record<Nivel | "pendiente", string> = {
  ok: "Correcto",
  aviso: "Aviso",
  error: "Error",
  pendiente: "Pendiente",
}

/** Ítem de una lista de verificación: ícono de estado + título + detalle. */
export function ItemNivel({ nivel, titulo, detalle }: { nivel: Nivel | "pendiente"; titulo: ReactNode; detalle?: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full"
        style={{ background: `color-mix(in oklch, ${TONO[nivel]} 16%, transparent)`, ...textoTono(TONO[nivel]) }}
        aria-label={NIVEL_LABEL[nivel]}
        role="img"
      >
        {ICONO[nivel]}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium">{titulo}</div>
        {detalle && <div className="text-sm text-muted-foreground">{detalle}</div>}
      </div>
    </li>
  )
}

export function Kpis({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
      {kpis.map((k) => (
        <Card key={k.id} className="gap-1 p-4" data-testid={`it-kpi-${k.id}`}>
          <div className="text-xs font-medium text-muted-foreground">{k.etiqueta}</div>
          <div
            className="font-display text-3xl font-semibold tabular-nums"
            style={k.estado && k.estado !== "neutro" ? textoTono(TONO[k.estado]) : undefined}
          >
            {valorKpi(k)}
          </div>
          {k.nota && <div className="text-xs text-muted-foreground">{k.nota}</div>}
        </Card>
      ))}
    </div>
  )
}

export function Seccion({ titulo, detalle, children, className, accion }: {
  titulo: ReactNode
  detalle?: ReactNode
  children: ReactNode
  className?: string
  accion?: ReactNode
}) {
  return (
    <Card className={cn("gap-3 p-5", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{titulo}</h2>
          {detalle && <p className="text-sm text-muted-foreground">{detalle}</p>}
        </div>
        {accion}
      </div>
      {children}
    </Card>
  )
}

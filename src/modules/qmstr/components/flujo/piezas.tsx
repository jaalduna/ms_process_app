import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { ESTADO_BASE_LABEL, ESTADO_TANDA_LABEL, TIPO_TANDA_LABEL, type EstadoBase, type EstadoTanda, type TipoTanda } from "../../types"
import { TONO_BASE, TONO_TANDA, TONO_TIPO, tono } from "./formato"

/** Chip tonal (fondo suave + texto contrastado). El tono es una variable CSS de la vista. */
export function Chip({ tone, children, className, dot, ...rest }: {
  tone: string
  children: ReactNode
  className?: string
  dot?: "solid" | "pulse"
} & Omit<React.ComponentProps<"span">, "children">) {
  return (
    <span
      {...rest}
      style={tono(tone)}
      className={cn("qf-tone inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", className)}
    >
      {dot && <span aria-hidden className={cn("size-1.5 rounded-full bg-[var(--tone)]", dot === "pulse" && "qf-pulse")} />}
      {children}
    </span>
  )
}

export function ChipBase({ estado }: { estado: EstadoBase }) {
  return (
    <Chip tone={TONO_BASE[estado]} dot={estado === "en_proceso" ? "pulse" : "solid"} data-estado={estado}>
      {ESTADO_BASE_LABEL[estado]}
    </Chip>
  )
}

export function ChipTanda({ estado, pausada }: { estado: EstadoTanda; pausada?: boolean }) {
  const activa = !pausada && !["cerrada", "revision_manual", "sin_bases"].includes(estado)
  return (
    <Chip tone={TONO_TANDA[estado]} dot={activa ? "pulse" : "solid"} data-testid="qf-tanda-estado">
      {ESTADO_TANDA_LABEL[estado]}
    </Chip>
  )
}

export function ChipTipo({ tipo }: { tipo: TipoTanda }) {
  return <Chip tone={TONO_TIPO[tipo]}>{TIPO_TANDA_LABEL[tipo]}</Chip>
}

/** Bloque de estado vacío/error con ícono, título y una acción opcional. */
export function Vacio({ icon, titulo, children, accion, tono: t = "var(--primary)", role }: {
  icon: ReactNode
  titulo: string
  children?: ReactNode
  accion?: ReactNode
  tono?: string
  role?: string
}) {
  return (
    <div role={role} className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      <span style={tono(t)} className="qf-tone grid size-11 place-items-center rounded-full [&>svg]:size-5">{icon}</span>
      <div className="space-y-1">
        <p className="font-display text-base font-semibold">{titulo}</p>
        {children && <div className="mx-auto max-w-md text-sm text-muted-foreground">{children}</div>}
      </div>
      {accion}
    </div>
  )
}

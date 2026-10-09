import { useState } from "react"
import { CornerUpLeft, Inbox, Mail, MailCheck, Paperclip } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatChile } from "../../time"
import type { FlujoCorreo, Tanda } from "../../types"
import { Chip, Vacio } from "./piezas"

const TIPO_LABEL = { resultados: "Resultados", pase_mtr: "Pase a MTR" } as const

/** En simulación QMSTR_CORREO_PARA puede venir vacío: se dice, en vez de dejar el campo en blanco. */
const SIN_DESTINATARIOS = "sin destinatarios configurados"

/**
 * Estilo base de la vista previa. El HTML de la API trae solo párrafos y listas, sin tipografía; sin
 * esto el iframe lo pinta con la serif del navegador, que no es como lo ve Outlook.
 */
const ESTILO_CORREO =
  "body{margin:20px;background:#fff;color:#1f2933;font:14px/1.55 'Segoe UI',Aptos,Calibri,Arial,sans-serif}" +
  "p{margin:0 0 .8em}ul,ol{margin:0 0 .8em;padding-left:1.4em}a{color:#0e7c88}" +
  "table{border-collapse:collapse}td,th{border:1px solid #d7dde3;padding:4px 8px;text-align:left}"

interface BandejaCorreosProps {
  correos: FlujoCorreo[]
  tandas: Tanda[]
}

/** Bandeja de correos de la vista: lista + vista previa del HTML (en simulación es lo único que "sale"). */
export function BandejaCorreos({ correos, tandas }: BandejaCorreosProps) {
  const [elegido, setElegido] = useState<string | null>(null)
  const actual = correos.find((c) => c.id === elegido) ?? correos[0]
  const numero = new Map(tandas.map((t) => [t.id, t.numero]))

  if (correos.length === 0) {
    return (
      <Vacio icon={<Inbox />} titulo="Todavía no hay correos en este período">
        El correo de resultados sale cuando termina una corrida, y el pase a MTR después del hito 10.
      </Vacio>
    )
  }

  return (
    <div className="grid overflow-hidden rounded-2xl border bg-card lg:grid-cols-[minmax(0,22rem)_1fr]" data-testid="qf-bandeja">
      <ul className="max-h-[32rem] divide-y overflow-y-auto border-b lg:border-r lg:border-b-0" aria-label="Correos">
        {correos.map((c) => {
          const activo = c.id === actual.id
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setElegido(c.id)}
                aria-current={activo}
                data-testid={`qf-correo-${c.tipo}`}
                className={cn(
                  "relative flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/60",
                  activo && "bg-[color-mix(in_oklch,var(--primary)_8%,transparent)]",
                )}
              >
                {activo && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-primary" />}
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {c.tipo === "resultados" ? <Mail className="size-3.5" /> : <MailCheck className="size-3.5" />}
                  {TIPO_LABEL[c.tipo]}
                  {numero.has(c.tanda_id) && <span>tanda {numero.get(c.tanda_id)}</span>}
                  <time className="ml-auto tabular-nums" dateTime={c.at}>{formatChile(c.at)}</time>
                </span>
                <span className="line-clamp-2 text-sm font-medium">{c.asunto}</span>
                <span className="truncate text-xs text-muted-foreground">Para {c.para.join(", ") || SIN_DESTINATARIOS}</span>
              </button>
            </li>
          )
        })}
      </ul>

      <article className="flex min-w-0 flex-col" data-testid="qf-correo-preview">
        <header className="space-y-1.5 border-b px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-semibold">{actual.asunto}</h3>
            {actual.enviado
              ? <Chip tone="var(--qf-aplicada)" dot="solid">Enviado</Chip>
              : <Chip tone="var(--qf-retenida)" dot="solid">Simulado, no se envió</Chip>}
            {actual.en_respuesta_a && (
              <Chip tone="var(--qf-en-proceso)" title="Respuesta a todos en el hilo de la liberación metodológica">
                <CornerUpLeft className="size-3" /> En el hilo de la liberación
              </Chip>
            )}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-muted-foreground">Para</dt><dd className={cn("break-all", actual.para.length === 0 && "text-muted-foreground italic")}>
              {actual.para.join(", ") || SIN_DESTINATARIOS}
            </dd>
            {actual.cc.length > 0 && <><dt className="text-muted-foreground">CC</dt><dd className="break-all">{actual.cc.join(", ")}</dd></>}
          </dl>
          {actual.adjuntos.length > 0 && (
            <p className="flex flex-wrap gap-1.5 pt-1">
              {actual.adjuntos.map((a) => (
                <span key={a} className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-xs">
                  <Paperclip className="size-3" />{a}
                </span>
              ))}
            </p>
          )}
        </header>
        {/* El HTML lo arma la API; se muestra aislado (sin scripts ni acceso al origen de la app). */}
        <iframe
          title={`Vista previa: ${actual.asunto}`}
          sandbox=""
          srcDoc={`<!doctype html><meta charset="utf-8"><style>${ESTILO_CORREO}</style><body>${actual.html}</body>`}
          className="min-h-80 w-full flex-1 bg-white"
        />
      </article>
    </div>
  )
}

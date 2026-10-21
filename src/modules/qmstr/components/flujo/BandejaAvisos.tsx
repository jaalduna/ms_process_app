import { useMemo } from "react"
import { BellRing, ExternalLink, Eye, Undo2, UserCheck } from "lucide-react"
import { formatChile } from "../../time"
import { TIPO_AVISO_LABEL, type Entrega, type FlujoAviso, type Tanda, type TipoAviso } from "../../types"
import { Chip, Vacio } from "./piezas"

const JIRA_URL = "https://requestmanager.atlassian.net/browse/"

const ICONO_TIPO = { observadores: Eye, pase_mtr: UserCheck, reversion_aplicada: Undo2 } as const
const TONO_AVISO: Record<TipoAviso, string> = {
  observadores: "var(--qf-en-proceso)",
  pase_mtr: "var(--qf-aplicada)",
  reversion_aplicada: "var(--qf-revertida)",
}

/** Marca de Jira (rombos apilados) en una sola tinta, para no depender de un set de logos externo. */
function IconoJira({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M12.6 2.4 21.2 11a1.4 1.4 0 0 1 0 2l-3.1 3.1-5.5-5.5a1.4 1.4 0 0 1 0-2z" opacity=".55" />
      <path d="M11.4 21.6 2.8 13a1.4 1.4 0 0 1 0-2l3.1-3.1 5.5 5.5a1.4 1.4 0 0 1 0 2z" opacity=".55" />
      <path d="m12 8.4 3.6 3.6-3.6 3.6L8.4 12z" />
    </svg>
  )
}

/** El ticket SIM-n sólo existe en la simulación: no tiene página a la que enlazar. */
function Ticket({ jiraKey }: { jiraKey: string }) {
  const real = !jiraKey.startsWith("SIM-")
  const cuerpo = <><IconoJira className="size-3.5" />{jiraKey}{real && <ExternalLink className="size-3" />}</>
  const clases = "inline-flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5 text-xs font-semibold"
  return real
    ? <a href={`${JIRA_URL}${jiraKey}`} target="_blank" rel="noreferrer" className={`${clases} text-primary hover:underline`} data-testid="qf-aviso-ticket">{cuerpo}</a>
    : <span className={clases} data-testid="qf-aviso-ticket" title="Ticket simulado: no existe en Jira">{cuerpo}</span>
}

/** Sin nombre resuelto se muestra el accountId acortado (prefijo del tenant + 8 caracteres). */
const abreviar = (id: string) => {
  const [prefijo, resto = ""] = id.split(":")
  return resto ? `${prefijo}:${resto.slice(0, 8)}…` : id
}

function Aviso({ aviso: a }: { aviso: FlujoAviso }) {
  const Icono = ICONO_TIPO[a.tipo]
  return (
    <li className="space-y-2.5 px-4 py-3.5" data-testid={`qf-aviso-${a.tipo}`} data-publicado={a.publicado}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <Chip tone={TONO_AVISO[a.tipo]}><Icono className="size-3" />{TIPO_AVISO_LABEL[a.tipo]}</Chip>
        {a.jira_key && <Ticket jiraKey={a.jira_key} />}
        {a.publicado
          ? <Chip tone="var(--qf-aplicada)" dot="solid" data-testid="qf-aviso-estado">Publicado en Jira</Chip>
          : <Chip tone="var(--qf-retenida)" dot="solid" data-testid="qf-aviso-estado">Simulado, no se publicó</Chip>}
        <time className="ml-auto text-xs text-muted-foreground tabular-nums" dateTime={a.at}>{formatChile(a.at)}</time>
      </div>
      <p className="text-sm leading-relaxed" data-testid="qf-aviso-texto">{a.texto}</p>
      {a.destinatarios.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Destinatarios">
          {a.destinatarios.map((d) => (
            <li key={d.account_id} title={d.account_id}
              className="rounded-full bg-[color-mix(in_oklch,var(--primary)_10%,transparent)] px-2 py-0.5 text-xs font-medium text-primary">
              @{d.nombre ?? abreviar(d.account_id)}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

interface BandejaAvisosProps {
  avisos: FlujoAviso[]
  tandas: Tanda[]
  /** Con entrega directa en J no hay ticket ni aviso a MTR: la bandeja queda para otros avisos del flujo. */
  entrega?: Entrega
}

/**
 * Avisos del flujo en el ticket de Jira, agrupados por tanda y en orden cronológico dentro de cada una.
 * En simulación nada se publica: la lista es lo único que muestra qué se habría escrito.
 */
export function BandejaAvisos({ avisos, tandas, entrega = "ticket" }: BandejaAvisosProps) {
  const grupos = useMemo(() => {
    const numero = new Map(tandas.map((t) => [t.id, t.numero]))
    const porTanda = new Map<string, FlujoAviso[]>()
    for (const a of avisos) porTanda.set(a.tanda_id, [...(porTanda.get(a.tanda_id) ?? []), a])
    return [...porTanda.entries()]
      .map(([tid, lista]) => ({ tid, numero: numero.get(tid), lista: [...lista].sort((x, y) => x.at.localeCompare(y.at)) }))
      .sort((x, y) => (y.numero ?? 0) - (x.numero ?? 0))
  }, [avisos, tandas])

  if (avisos.length === 0) {
    return (
      <Vacio icon={<BellRing />} titulo="Todavía no hay avisos en este período">
        {entrega === "pythoncac"
          ? "Aquí aparecerán los avisos del flujo que necesiten atención. Con la aplicación directa en J no se crean tickets ni se avisa a MTR por Jira."
          : "Cuando se crea el ticket de DQ se agrega a MTR como observador, y al validar o revertir la tanda se le avisa con una mención en el ticket."}
      </Vacio>
    )
  }

  return (
    <div className="space-y-4" data-testid="qf-avisos">
      {grupos.map((g) => (
        <section key={g.tid} className="overflow-hidden rounded-2xl border bg-card" aria-label={`Avisos de la tanda ${g.numero ?? ""}`}>
          <h3 className="border-b bg-muted/30 px-4 py-2 font-display text-sm font-semibold">
            {g.numero ? `Tanda ${g.numero}` : "Tanda"}
            <span className="ml-2 font-normal text-muted-foreground">{g.lista.length === 1 ? "1 aviso" : `${g.lista.length} avisos`}</span>
          </h3>
          <ul className="divide-y">{g.lista.map((a) => <Aviso key={a.id} aviso={a} />)}</ul>
        </section>
      ))}
    </div>
  )
}

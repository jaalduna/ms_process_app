import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { valorParametro } from "../format"
import type { ParamDef, ValoresParametros } from "../types"

/** Un control por parámetro, generado desde las definiciones que entrega la API. Los del grupo
 * «avanzado» van plegados; parten abiertos si alguno viene cambiado (un escenario guardado). */
export function ParametrosPanel({ definiciones, valores, referencia, onChange }: {
  definiciones: ParamDef[]
  valores: ValoresParametros
  referencia: ValoresParametros
  onChange: (clave: string, v: number | boolean) => void
}) {
  const diarios = definiciones.filter((d) => d.grupo !== "avanzado")
  const avanzados = definiciones.filter((d) => d.grupo === "avanzado")
  const cambiados = avanzados.filter((d) => valores[d.clave] !== referencia[d.clave]).length
  const [abierto, setAbierto] = useState(cambiados > 0)
  const control = (d: ParamDef) => (
    <Parametro key={d.clave} d={d} v={valores[d.clave]} ref_={referencia[d.clave]} onChange={onChange} />
  )

  return (
    <div className="space-y-5">
      {diarios.map(control)}
      {avanzados.length > 0 && (
        <div className="border-t pt-3">
          <button
            type="button"
            onClick={() => setAbierto((a) => !a)}
            aria-expanded={abierto}
            className="flex w-full items-center gap-1.5 text-sm font-medium"
            data-testid="it-param-avanzados"
          >
            {abierto ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
            Más parámetros ({avanzados.length})
            {cambiados > 0 && (
              <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-normal">
                {cambiados === 1 ? "1 cambiado" : `${cambiados} cambiados`}
              </span>
            )}
          </button>
          {abierto && <div className="mt-4 space-y-5">{avanzados.map(control)}</div>}
        </div>
      )}
    </div>
  )
}

function Parametro({ d, v, ref_, onChange }: {
  d: ParamDef
  v: number | boolean
  ref_: number | boolean
  onChange: (clave: string, v: number | boolean) => void
}) {
  const cambiado = v !== ref_
  const id = `it-param-${d.clave}`
  const antes = cambiado && (
    <span className="ml-1.5 text-xs font-normal text-muted-foreground">(antes {etiquetaValor(d, ref_)})</span>
  )
  if (d.tipo === "booleano") {
    return (
      <div className="flex items-start justify-between gap-3">
        <label htmlFor={id} className="space-y-0.5">
          <span className="block text-sm font-medium">
            {d.etiqueta}
            {antes}
          </span>
          <span className="block text-xs text-muted-foreground">
            {d.clave} · {d.ayuda}
          </span>
        </label>
        <Switch id={id} checked={v === true} onCheckedChange={(c) => onChange(d.clave, c)} />
      </div>
    )
  }
  if (d.tipo === "opcion") {
    return (
      <div className="space-y-1.5">
        <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-sm font-medium">
          <span>{d.etiqueta}</span>
          {antes}
        </label>
        <select
          id={id}
          value={v as number}
          onChange={(e) => onChange(d.clave, Number(e.target.value))}
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
        >
          {d.opciones!.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {d.clave} · {d.ayuda}
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-sm font-medium">
        <span>{d.etiqueta}</span>
        <span className="tabular-nums">
          {valorParametro(d, v as number)}
          {antes}
        </span>
      </label>
      <input
        id={id}
        type="range"
        min={d.min}
        max={d.max}
        step={d.paso ?? 1}
        value={v as number}
        onChange={(e) => onChange(d.clave, Number(e.target.value))}
        className="h-6 w-full cursor-pointer accent-[var(--primary)]"
      />
      <p className="text-xs text-muted-foreground">
        {d.clave} · {d.ayuda}
      </p>
    </div>
  )
}

function etiquetaValor(d: ParamDef, v: number | boolean): string {
  if (d.tipo === "opcion") return d.opciones!.find((o) => o.valor === v)?.etiqueta ?? String(v)
  return valorParametro(d, v)
}

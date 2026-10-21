import { useState, type KeyboardEvent } from "react"
import { ChevronDown, ChevronRight, Info, Minus, Plus } from "lucide-react"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { valorParametro } from "../format"
import type { ParamDef, ValoresParametros } from "../types"

type Valor = number | boolean | string

/**
 * Parámetros en grupos plegables (≤5 por grupo, como los define la API), una fila compacta por
 * parámetro. La explicación, la clave técnica, el rango y el valor del país salen al posar el
 * mouse o enfocar la ⓘ. Parten abiertos el primer grupo y los que traen cambios.
 */
export function ParametrosPanel({ definiciones, valores, referencia, onChange }: {
  definiciones: ParamDef[]
  valores: ValoresParametros
  referencia: ValoresParametros
  onChange: (clave: string, v: Valor) => void
}) {
  const grupos: { nombre: string; defs: ParamDef[] }[] = []
  for (const d of definiciones) {
    const nombre = d.grupo ?? "Parámetros"
    const g = grupos.find((x) => x.nombre === nombre)
    if (g) g.defs.push(d)
    else grupos.push({ nombre, defs: [d] })
  }
  const cambiados = (g: { defs: ParamDef[] }) => g.defs.filter((d) => valores[d.clave] !== referencia[d.clave]).length
  const [abiertos, setAbiertos] = useState<Set<string>>(
    () => new Set(grupos.filter((g, i) => i === 0 || cambiados(g) > 0).map((g) => g.nombre)),
  )
  const alternar = (n: string) =>
    setAbiertos((a) => {
      const s = new Set(a)
      if (s.has(n)) s.delete(n)
      else s.add(n)
      return s
    })

  return (
    <TooltipProvider delayDuration={200}>
      <div className="divide-y rounded-lg border">
        {grupos.map((g, i) => {
          const abierto = abiertos.has(g.nombre)
          const n = cambiados(g)
          return (
            <div key={g.nombre}>
              <button
                type="button"
                onClick={() => alternar(g.nombre)}
                aria-expanded={abierto}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm font-medium hover:bg-accent/40"
                data-testid={`it-param-grupo-${i}`}
              >
                {abierto ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                {g.nombre}
                <span className="ml-auto flex items-center gap-2 text-xs font-normal text-muted-foreground">
                  {n > 0 && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-foreground">
                      {n === 1 ? "1 cambiado" : `${n} cambiados`}
                    </span>
                  )}
                  {g.defs.length}
                </span>
              </button>
              {abierto && (
                <div className="space-y-1 px-3 pb-2">
                  {g.defs.map((d) => (
                    <Fila key={d.clave} d={d} v={valores[d.clave]} pais={referencia[d.clave]} onChange={onChange} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </TooltipProvider>
  )
}

function rango(d: ParamDef): string | null {
  if (d.tipo === "booleano") return null
  if (d.tipo === "opcion") return `${d.opciones!.length} opciones`
  return `${valorParametro(d, d.min!)} a ${valorParametro(d, d.max!)}`
}

function Fila({ d, v, pais, onChange }: {
  d: ParamDef
  v: Valor
  pais: Valor
  onChange: (clave: string, v: Valor) => void
}) {
  const cambiado = v !== pais
  const id = `it-param-${d.clave}`
  const r = rango(d)
  return (
    <div className="flex min-h-9 items-center justify-between gap-2" data-testid={`it-fila-${d.clave}`}>
      <div className="flex min-w-0 items-center gap-1">
        <label htmlFor={id} className={cn("truncate text-sm", cambiado && "font-semibold")} title={d.etiqueta}>
          {d.etiqueta}
        </label>
        {cambiado && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="cambiado" role="img" />}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`Qué es ${d.etiqueta}`}
              data-testid={`it-param-ayuda-${d.clave}`}
            >
              <Info className="size-3.5" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-72 space-y-1 text-left">
            <p>{d.ayuda}</p>
            <p className="font-mono opacity-80">{d.clave}</p>
            {r && <p className="opacity-80">Rango: {r}</p>}
            <p className="opacity-80">
              País: {valorParametro(d, pais)}
              {cambiado && ` · ahora ${valorParametro(d, v)}`}
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="shrink-0">
        <Control id={id} d={d} v={v} onChange={(x) => onChange(d.clave, x)} />
      </div>
    </div>
  )
}

/** Escala en que se escribe el número: los porcentajes y errores se editan en %. */
const escala = (d: ParamDef) => (d.formato === "pct" || d.formato === "err" ? 100 : 1)
const decimales = (d: ParamDef) => {
  const paso = (d.paso ?? 1) * escala(d)
  return paso >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(paso) - 1e-9))
}

function Control({ id, d, v, onChange }: { id: string; d: ParamDef; v: Valor; onChange: (v: Valor) => void }) {
  const [texto, setTexto] = useState<string | null>(null)
  if (d.tipo === "booleano") return <Switch id={id} checked={v === true} onCheckedChange={onChange} />
  if (d.tipo === "opcion") {
    return (
      <select
        id={id}
        value={String(v)}
        // el valor vuelve con su tipo (número o texto), como lo valida la API
        onChange={(e) => onChange(d.opciones!.find((o) => String(o.valor) === e.target.value)!.valor)}
        className="h-8 max-w-44 rounded-md border bg-background px-1.5 text-sm"
      >
        {d.opciones!.map((o) => (
          <option key={String(o.valor)} value={String(o.valor)}>
            {o.etiqueta}
          </option>
        ))}
      </select>
    )
  }
  const n = v as number
  const k = escala(d)
  const dec = decimales(d)
  const paso = d.paso ?? 1
  const mostrar = (x: number) =>
    (x * k).toLocaleString("es-CL", { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: false })
  // al rango y a la grilla del paso, sin ruido de punto flotante
  const ajustar = (x: number) =>
    Number(Math.min(d.max!, Math.max(d.min!, Math.round((x - d.min!) / paso) * paso + d.min!)).toPrecision(12))
  const confirmar = () => {
    if (texto === null) return
    const t = texto.trim()
    setTexto(null)
    if (t === "") return
    const x = Number(t.replace(",", "."))
    if (!Number.isFinite(x)) {
      toast.error(`${d.etiqueta}: no es un número`)
      return
    }
    const nuevo = ajustar(x / k)
    if (nuevo !== n) onChange(nuevo)
  }
  const teclas = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") confirmar()
    if (e.key === "Escape") setTexto(null)
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault()
      onChange(ajustar(n + (e.key === "ArrowUp" ? paso : -paso)))
    }
  }
  const boton =
    "flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
  return (
    <div className="flex items-center gap-0.5">
      <button type="button" className={boton} aria-label={`Bajar ${d.etiqueta}`} disabled={n <= d.min!}
        onClick={() => onChange(ajustar(n - paso))}>
        <Minus className="size-3.5" aria-hidden />
      </button>
      <div className="flex items-baseline">
        {d.formato === "percentil" && <span className="mr-0.5 text-xs text-muted-foreground">p</span>}
        <input
          id={id}
          inputMode="decimal"
          value={texto ?? mostrar(n)}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={confirmar}
          onKeyDown={teclas}
          onFocus={(e) => e.currentTarget.select()}
          className="h-7 w-16 rounded-md border bg-background px-1.5 text-right text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
        {k === 100 && <span className="ml-0.5 text-xs text-muted-foreground">%</span>}
      </div>
      <button type="button" className={boton} aria-label={`Subir ${d.etiqueta}`} disabled={n >= d.max!}
        onClick={() => onChange(ajustar(n + paso))}>
        <Plus className="size-3.5" aria-hidden />
      </button>
    </div>
  )
}

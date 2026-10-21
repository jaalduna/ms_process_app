import { useMemo, useState, type ClipboardEvent, type KeyboardEvent } from "react"
import { AlertTriangle, ClipboardPaste, Maximize2, RotateCcw, Search } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { num, TONO, textoTono } from "../format"
import {
  cambiosDelBloque,
  conTarget,
  descuadres,
  descuadreTotal,
  leerPegado,
  llevarRegion,
  llevarTotal,
  subpoblaciones,
  target,
  type Cambios,
} from "../targets"
import type { BloqueEstructura, Estructura } from "../types"
import { Seccion } from "./piezas"

/** Lo que logró el último cálculo en una celda: el valor comparable con el target y su detalle. */
export type Logro = { valor: number; detalle: string }

/**
 * Targets por segmento editables en la app (Elegibilidad: muestra ideal de la Estructura;
 * Pesaje: universo del período). Cada cambio queda en los ajustes de la vuelta y se guarda con
 * el escenario; la API rechaza lo que no cuadra, así que acá se avisa antes y se ofrece arreglarlo.
 */
export function TargetsSegmento({ estructura, cambios, onCambios, logro, titulo, detalle, tolerancia }: {
  estructura: Estructura
  cambios: Cambios
  onCambios: (c: Cambios) => void
  /** Por Secuencia de celda. */
  logro?: Map<string, Logro>
  titulo: string
  detalle: string
  /** Pesaje: desvío aceptado del logro contra el target (0,001 = 0,1 %); sin él, el % se lee como
   * llenado de la muestra ideal (Elegibilidad). */
  tolerancia?: number
}) {
  const n = Object.keys(cambios).length
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(0)
  const malos = useMemo(() => descuadres(estructura, cambios), [estructura, cambios])
  const total = useMemo(() => descuadreTotal(estructura, cambios), [estructura, cambios])
  const vacio = useMemo(() => new Map<string, Logro>(), [])

  const restaurar = () => {
    const antes = cambios
    onCambios({})
    toast("Valores del país restaurados", { action: { label: "Deshacer", onClick: () => onCambios(antes) } })
  }
  const bloque = estructura.bloques[Math.min(activo, estructura.bloques.length - 1)]

  const cambiosYRestaurar = n > 0 && (
    <div className="flex items-center gap-2">
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums" data-testid="it-targets-cambios">
        {n === 1 ? "1 cambio" : `${n} cambios`}
      </span>
      <Button variant="ghost" size="sm" onClick={restaurar}>
        <RotateCcw aria-hidden /> Valores del país
      </Button>
    </div>
  )

  // tarjeta compacta junto a los parámetros; la matriz, que es ancha, se edita en un panel lateral
  return (
    <Seccion titulo={titulo} detalle={detalle}>
      {!abierto && (malos.length > 0 || total) && <AvisoDescuadre malos={malos} total={total} />}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {estructura.bloques.map((b) => (
          <li key={b.secuencia}>
            <span className="font-medium text-foreground">{b.nombre}</span> · {b.regiones.length} × {b.categorias.length}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={() => setAbierto(true)} data-testid="it-targets-abrir">
          <Maximize2 aria-hidden /> Ver y editar
        </Button>
        {!abierto && cambiosYRestaurar}
      </div>
      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent side="right" className="w-[min(1200px,96vw)] gap-0 overflow-y-auto sm:max-w-none">
          <SheetHeader className="pr-12">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SheetTitle>{titulo}</SheetTitle>
              {cambiosYRestaurar}
            </div>
            <SheetDescription>{detalle}</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-6">
            {(malos.length > 0 || total) && <AvisoDescuadre malos={malos} total={total} />}
            <div role="tablist" aria-label="Bloques de la Estructura" className="flex flex-wrap gap-1 border-b">
              {estructura.bloques.map((b, i) => {
                const c = cambiosDelBloque(b, cambios)
                return (
                  <button
                    key={b.secuencia}
                    role="tab"
                    aria-selected={b === bloque}
                    onClick={() => setActivo(i)}
                    className={cn(
                      "-mb-px border-b-2 px-3 py-1.5 text-sm",
                      b === bloque ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                    data-testid={`it-targets-bloque-${i}`}
                  >
                    {b.nombre}
                    {c > 0 && <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs tabular-nums">{c}</span>}
                  </button>
                )
              })}
            </div>
            <TablaBloque
              key={bloque.secuencia}
              estructura={estructura}
              bloque={bloque}
              cambios={cambios}
              logro={logro ?? vacio}
              tolerancia={tolerancia}
              onCambios={onCambios}
            />
          </div>
        </SheetContent>
      </Sheet>
    </Seccion>
  )
}

/** Qué es la cifra chica bajo cada celda y qué dice su color. */
function Leyenda({ tolerancia }: { tolerancia?: number }) {
  const punto = (tono: string, texto: string) => (
    <span className="inline-flex items-center gap-1">
      <span className="size-2 rounded-full" style={{ background: tono }} aria-hidden />
      {texto}
    </span>
  )
  const pct = (x: number) => `${(x * 100).toLocaleString("es-CL", { maximumFractionDigits: 2 })}%`
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" data-testid="it-targets-leyenda">
      <span>
        Bajo cada celda: <span className="font-medium text-foreground">{tolerancia !== undefined ? "logrado · desvío contra el universo" : "logrado · % del target"}</span>, del
        último cálculo (detalle al posar el mouse).
      </span>
      {tolerancia !== undefined ? (
        <>
          {punto(TONO.ok, `hasta ±${pct(tolerancia)}`)}
          {punto(TONO.error, "más que eso")}
        </>
      ) : (
        <>
          {punto(TONO.ok, "100% o más")}
          {punto(TONO.aviso, "90 a 99%")}
          {punto(TONO.error, "menos de 90%")}
        </>
      )}
    </p>
  )
}

function AvisoDescuadre({ malos, total }: {
  malos: ReturnType<typeof descuadres>
  total: ReturnType<typeof descuadreTotal>
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
      style={{ borderColor: "color-mix(in oklch, var(--warning) 45%, transparent)", background: "color-mix(in oklch, var(--warning) 10%, transparent)" }}
      data-testid="it-targets-descuadre"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" style={textoTono(TONO.aviso)} aria-hidden />
      <div className="space-y-1">
        {total && (
          <p>
            <span className="font-semibold">Los bloques no suman lo mismo:</span>{" "}
            {total.map((p) => `${p.bloque} ${num(p.total)}`).join(" · ")}. Usa «Llevar los demás bloques» al pie del
            bloque que quedó bien.
          </p>
        )}
        {malos.length > 0 && (
          <p>
            <span className="font-semibold">
              {malos.length === 1 ? "Una región no suma lo mismo" : `${malos.length} regiones no suman lo mismo`} en todos
              los bloques:
            </span>{" "}
            {malos.slice(0, 6).map((m) => `${m.nombre} (${m.porBloque.map((p) => `${p.bloque} ${num(p.total)}`).join(" · ")})`).join("; ")}
            {malos.length > 6 && ` y ${malos.length - 6} más`}. Usa «Igualar» en la fila de la región, o cambia su total.
          </p>
        )}
        <p>Hasta que cuadre no se puede calcular.</p>
      </div>
    </div>
  )
}

function TablaBloque({ estructura, bloque, cambios, logro, tolerancia, onCambios }: {
  estructura: Estructura
  bloque: BloqueEstructura
  cambios: Cambios
  logro: Map<string, Logro>
  tolerancia?: number
  onCambios: (c: Cambios) => void
}) {
  const [buscar, setBuscar] = useState("")
  const [soloCambios, setSoloCambios] = useState(false)
  const subp = useMemo(() => subpoblaciones(estructura, cambios), [estructura, cambios])
  const totalRegion = (r: BloqueEstructura["regiones"][number]) =>
    r.celdas.reduce((a, c) => a + target(cambios, c.secuencia, c.ideal), 0)
  // la región en los bloques donde aparece (como región o como celda); las filas «#» no se cruzan
  const enBloques = (r: BloqueEstructura["regiones"][number]) =>
    subp.get(r.id)?.porBloque ?? new Map([[bloque.nombre, totalRegion(r)]])
  const q = buscar.trim().toLowerCase()
  const filas = bloque.regiones.filter(
    (r) =>
      (!q || r.nombre.toLowerCase().includes(q)) &&
      (!soloCambios || r.celdas.some((c) => String(c.secuencia) in cambios) || new Set(enBloques(r).values()).size > 1),
  )
  const totalBloque = bloque.regiones.reduce((a, r) => a + totalRegion(r), 0)
  const otrosBloques = estructura.bloques.some(
    (b) => b !== bloque && b.regiones.reduce((a, r) => a + r.celdas.reduce((x, c) => x + target(cambios, c.secuencia, c.ideal), 0), 0) !== totalBloque,
  )
  const cats = bloque.categorias
  const celdaDe = (r: BloqueEstructura["regiones"][number], cat: string) => r.celdas.find((c) => c.categoria === cat)

  const pegar = (e: ClipboardEvent<HTMLInputElement>, fila: number, col: number) => {
    const m = leerPegado(e.clipboardData.getData("text"))
    if (!m || (m.length === 1 && m[0].length === 1)) {
      if (!m) {
        e.preventDefault()
        toast.error("Lo pegado no son números enteros", { description: "Copia solo las celdas con los targets, sin títulos." })
      }
      return
    }
    e.preventDefault()
    let c = cambios
    let puestos = 0
    m.forEach((valores, i) => {
      const r = filas[fila + i]
      if (!r) return
      valores.forEach((v, j) => {
        const cat = cats[col + j]
        const celda = cat !== undefined ? celdaDe(r, cat) : undefined
        if (v === null || !celda) return
        c = conTarget(c, celda.secuencia, celda.ideal, v)
        puestos += 1
      })
    })
    onCambios(c)
    const antes = cambios
    toast.success(`Se pegaron ${puestos} targets`, {
      description: "Revisa el cuadre entre bloques antes de calcular.",
      action: { label: "Deshacer", onClick: () => onCambios(antes) },
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar región"
            aria-label="Buscar región"
            className="h-8 w-52 pl-8"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={soloCambios} onChange={(e) => setSoloCambios(e.target.checked)} />
          Solo regiones con cambios o sin cuadrar
        </label>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ClipboardPaste className="size-3.5" aria-hidden />
          Puedes pegar un bloque copiado de Excel desde cualquier celda. Enter baja a la fila siguiente.
        </span>
      </div>
      <Leyenda tolerancia={tolerancia} />

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm" data-testid="it-targets-tabla">
          <thead>
            <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
              <th scope="col" className="sticky left-0 z-10 bg-muted px-3 py-2 text-left font-medium">Región</th>
              {cats.map((c) => (
                <th key={c} scope="col" className="max-w-32 px-2 py-2 text-right font-medium" title={c}>
                  <span className="line-clamp-2">{c}</span>
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-right font-medium">Total región</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((r, i) => {
              const otros = enBloques(r)
              const propio = totalRegion(r)
              const cuadra = new Set(otros.values()).size === 1
              const totalPais = r.total
              const cruza = !r.id.startsWith("#")
              return (
                <tr key={r.secuencia} className="border-b last:border-0" data-testid={`it-targets-fila-${r.id}`}>
                  <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-1.5 text-left font-medium whitespace-nowrap">
                    {r.nombre}
                  </th>
                  {cats.map((cat, j) => {
                    const celda = celdaDe(r, cat)
                    if (!celda) return <td key={cat} className="px-2 text-center text-muted-foreground">—</td>
                    return (
                      <td key={cat} className="px-1 py-1 align-top">
                        <CeldaTarget
                          valor={target(cambios, celda.secuencia, celda.ideal)}
                          pais={celda.ideal}
                          logro={logro.get(String(celda.secuencia))}
                          tolerancia={tolerancia}
                          etiqueta={`${r.nombre} · ${cat}`}
                          fila={i}
                          col={j}
                          onValor={(v) => onCambios(conTarget(cambios, celda.secuencia, celda.ideal, v))}
                          onPegar={(e) => pegar(e, i, j)}
                        />
                      </td>
                    )
                  })}
                  <td className="px-2 py-1 align-top">
                    <div className="flex flex-col items-end gap-1">
                      <CeldaTarget
                        valor={propio}
                        pais={totalPais}
                        etiqueta={`Total ${r.nombre}`}
                        fila={i}
                        col={cats.length}
                        total
                        soloLectura={!cruza}
                        onValor={(v) => onCambios(llevarRegion(estructura, cambios, r.id, v))}
                      />
                      {!cuadra && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs"
                          title={[...otros].map(([b, t]) => `${b}: ${num(t)}`).join("\n")}
                          onClick={() => onCambios(llevarRegion(estructura, cambios, r.id, propio, [bloque.nombre]))}
                          data-testid={`it-targets-igualar-${r.id}`}
                        >
                          <AlertTriangle className="size-3" style={textoTono(TONO.aviso)} aria-hidden />
                          Igualar a {num(propio)}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {filas.length === 0 && (
              <tr>
                <td colSpan={cats.length + 2} className="px-3 py-6 text-center text-muted-foreground">
                  Ninguna región calza con el filtro.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30 text-xs font-medium">
              <th scope="row" className="sticky left-0 bg-muted px-3 py-2 text-left">Total {bloque.nombre}</th>
              {cats.map((cat) => (
                <td key={cat} className="px-2 py-2 text-right tabular-nums">
                  {num(bloque.regiones.reduce((a, r) => {
                    const c = celdaDe(r, cat)
                    return a + (c ? target(cambios, c.secuencia, c.ideal) : 0)
                  }, 0))}
                </td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums">
                {num(totalBloque)}
                <span className="block font-normal text-muted-foreground">país {num(bloque.total)}</span>
                {otrosBloques && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1 h-6 px-2 text-xs"
                    title="Las regiones que también están en este bloque quedan con su total de acá; la diferencia se reparte en proporción entre las demás"
                    onClick={() => onCambios(llevarTotal(estructura, cambios, bloque.nombre))}
                    data-testid="it-targets-llevar-total"
                  >
                    <AlertTriangle className="size-3" style={textoTono(TONO.aviso)} aria-hidden />
                    Llevar los demás bloques a {num(totalBloque)}
                  </Button>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

/** Un target editable. Guarda al salir o con Enter; Escape deshace lo escrito. */
function CeldaTarget({ valor, pais, logro, tolerancia, etiqueta, fila, col, total = false, soloLectura = false, onValor, onPegar }: {
  valor: number
  pais: number
  logro?: Logro
  tolerancia?: number
  etiqueta: string
  fila: number
  col: number
  total?: boolean
  /** Total de una fila sin región: se edita celda por celda. */
  soloLectura?: boolean
  onValor: (v: number) => void
  onPegar?: (e: ClipboardEvent<HTMLInputElement>) => void
}) {
  const [texto, setTexto] = useState<string | null>(null)
  const cambiado = valor !== pais
  const confirmar = () => {
    if (texto === null) return
    const t = texto.trim().replace(/[.\s]/g, "")
    setTexto(null)
    if (t === "") return
    if (!/^\d+$/.test(t)) {
      toast.error(`${etiqueta}: el target tiene que ser un entero`)
      return
    }
    if (Number(t) !== valor) onValor(Number(t))
  }
  const mover = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setTexto(null)
      return
    }
    if (e.key !== "Enter") return
    e.preventDefault()
    confirmar()
    const destino = e.currentTarget
      .closest("table")
      ?.querySelector<HTMLInputElement>(`input[data-fila="${fila + (e.shiftKey ? -1 : 1)}"][data-col="${col}"]`)
    destino?.focus()
    destino?.select()
  }
  const final = logro ? logro.valor : null
  const avance = final !== null && valor > 0 ? final / valor : null
  const tono =
    avance === null
      ? TONO.neutro
      : tolerancia !== undefined
        ? Math.abs(avance - 1) <= tolerancia ? TONO.ok : TONO.error
        : avance >= 1 ? TONO.ok : avance >= 0.9 ? TONO.aviso : TONO.error
  const ayuda = [cambiado ? `País: ${num(pais)}` : null, logro ? logro.detalle : null].filter(Boolean).join("\n")
  const mostrado = texto ?? num(valor)

  return (
    <div className="flex flex-col items-end" title={ayuda || undefined}>
      <input
        inputMode="numeric"
        aria-label={etiqueta}
        data-fila={fila}
        data-col={col}
        value={mostrado}
        readOnly={soloLectura}
        onFocus={(e) => {
          if (soloLectura) return
          setTexto(String(valor))
          const el = e.currentTarget
          requestAnimationFrame(() => el.select())
        }}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={confirmar}
        onKeyDown={mover}
        onPaste={onPegar}
        className={cn(
          "h-7 rounded-md border bg-background px-1.5 text-right tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          total && "font-semibold",
          soloLectura && "border-transparent bg-transparent",
          cambiado && "font-semibold",
        )}
        // ancho según la cifra: Elegibilidad usa decenas, el universo de Pesaje millones
        style={{
          width: `${Math.max(5, num(Math.max(valor, pais)).length + 2)}ch`,
          ...(cambiado ? { background: "color-mix(in oklch, var(--warning) 14%, var(--background))", borderColor: "color-mix(in oklch, var(--warning) 55%, transparent)" } : {}),
        }}
      />
      {final !== null && avance !== null && (
        <span className="mt-0.5 text-[11px] leading-none tabular-nums" style={textoTono(tono)}>
          {num(final)} · {tolerancia !== undefined ? `${((avance - 1) * 100).toLocaleString("es-CL", { maximumFractionDigits: 2, signDisplay: "exceptZero" })}%` : `${Math.round(avance * 100)}%`}
        </span>
      )}
      {cambiado && final === null && (
        <span className="mt-0.5 text-[11px] leading-none text-muted-foreground tabular-nums">país {num(pais)}</span>
      )}
    </div>
  )
}

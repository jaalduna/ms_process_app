import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { err, num, TONO, textoTono } from "../format"
import type { CeldaUniverso, GrupoCeldas, IndicadorRevision, Nivel } from "../types"
import { Seccion } from "./piezas"

const es = "es-CL"

function valorIndicador(i: Pick<IndicadorRevision, "formato">, v: number | null | undefined): string {
  if (v == null) return "—"
  if (i.formato === "pct1") return `${v.toLocaleString(es, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
  if (i.formato === "x") return `${v.toLocaleString(es, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×`
  if (i.formato === "err") return err(v)
  return num(v)
}

const ESTADO_TEXTO: Record<Nivel | "neutro", string> = {
  ok: "En rango",
  aviso: "Fuera de rango",
  error: "Sobre la meta",
  neutro: "—",
}

/** Regla común a los indicadores con historia; solo se muestra la de los que usan otra. */
const REGLA_RANGO = "Fuera del mínimo–máximo de los últimos 12 meses"

/** Mini serie de 12 meses con la banda mínimo–máximo y el valor de esta corrida al final. */
function Serie({ i }: { i: IndicadorRevision }) {
  const puntos = i.serie.filter((p) => p.valor != null) as { periodo: string; valor: number }[]
  if (puntos.length < 2) return null
  const valores = [...puntos.map((p) => p.valor), i.valor]
  const lo = Math.min(...valores)
  const hi = Math.max(...valores)
  const W = 100
  const H = 28
  const x = (k: number) => (k / puntos.length) * (W - 6) + 3
  const y = (v: number) => (hi === lo ? H / 2 : H - 3 - ((v - lo) / (hi - lo)) * (H - 6))
  const linea = puntos.map((p, k) => `${x(k)},${y(p.valor)}`).join(" ")
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-7 w-[100px]"
      role="img"
      aria-label={`${i.etiqueta}: últimos ${puntos.length} meses entre ${valorIndicador(i, lo)} y ${valorIndicador(i, hi)}; esta corrida ${valorIndicador(i, i.valor)}`}
    >
      <polyline points={linea} fill="none" stroke="currentColor" strokeOpacity={0.45} strokeWidth={1.5} />
      <circle
        cx={x(puntos.length)}
        cy={y(i.valor)}
        r={3.5}
        fill={i.estado === "ok" || i.estado === "neutro" ? "var(--qf-wp-blue)" : "#f871a0"}
      />
    </svg>
  )
}

export function RevisionHistoria({ indicadores }: { indicadores: IndicadorRevision[] }) {
  return (
    <Seccion
      ancla="iterar.revision"
      titulo="Revisión contra la historia"
      detalle="Cada indicador de esta corrida contra los 12 meses anteriores publicados. Rango normal supuesto: el mínimo y el máximo de esos meses."
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Indicador</TableHead>
            <TableHead className="text-right">Esta corrida</TableHead>
            <TableHead className="text-right">Mes anterior</TableHead>
            {/* la serie y su rango en una columna: la tarjeta cabe sin scroll horizontal */}
            <TableHead className="text-right">Últimos 12 meses</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {indicadores.map((i) => (
            <TableRow key={i.id} data-testid={`it-rev-${i.id}`}>
              <TableCell className="min-w-32 font-medium whitespace-normal">
                {i.etiqueta}
                {i.regla !== REGLA_RANGO && (
                  <span className="block text-xs font-normal text-muted-foreground">{i.regla}</span>
                )}
              </TableCell>
              <TableCell
                className="text-right font-semibold tabular-nums"
                style={i.estado === "neutro" || i.estado === "ok" ? undefined : textoTono(TONO[i.estado])}
              >
                {valorIndicador(i, i.valor)}
                {i.estado !== "neutro" && <span className="sr-only"> ({ESTADO_TEXTO[i.estado]})</span>}
                {(i.estado === "aviso" || i.estado === "error") && (
                  <span className="block text-xs font-medium">{ESTADO_TEXTO[i.estado]}</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{valorIndicador(i, i.mes_anterior)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {i.min12 != null && i.max12 != null ? (
                  <span className="inline-flex flex-col items-end gap-0.5">
                    <Serie i={i} />
                    <span className="text-xs text-muted-foreground" title="Rango normal: mínimo y máximo de los 12 meses">
                      {valorIndicador(i, i.min12)} – {valorIndicador(i, i.max12)}
                    </span>
                  </span>
                ) : (
                  "—"
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Seccion>
  )
}

const variacion = (a: number, b: number) => (b ? a / b - 1 : 0)
const pctSigno = (d: number) =>
  `${d >= 0 ? "+" : ""}${(d * 100).toLocaleString(es, { maximumFractionDigits: 0 })} %`

function nombreCelda(c: CeldaUniverso) {
  return c.padre ? (
    <>
      <span className="text-muted-foreground">{c.padre} · </span>
      {c.categoria}
    </>
  ) : (
    <span className="font-semibold">{c.categoria}</span>
  )
}

export function CeldasUniverso({ grupos }: { grupos: GrupoCeldas[] }) {
  const [grupoId, setGrupoId] = useState(grupos[0]?.id ?? "")
  const [soloAlertas, setSoloAlertas] = useState(true)
  const [buscar, setBuscar] = useState("")
  const conteo = useMemo(
    () => Object.fromEntries(grupos.map((g) => [g.id, g.celdas.filter((c) => c.estado !== "ok").length])),
    [grupos],
  )
  const grupo = grupos.find((g) => g.id === grupoId) ?? grupos[0]
  if (!grupo) return null
  const q = buscar.trim().toLowerCase()
  const filas = grupo.celdas.filter(
    (c) =>
      (!soloAlertas || c.estado !== "ok") &&
      (!q || `${c.padre ?? ""} ${c.categoria}`.toLowerCase().includes(q)),
  )

  return (
    <Seccion
      ancla="iterar.celdas"
      titulo="Celdas del Universo"
      detalle="Los mismos grupos del Excel del Pesaje. Cada celda contra su promedio de 12 meses; las reglas de alerta son una propuesta inicial."
    >
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Grupo de celdas">
        {grupos.map((g) => {
          const on = g.id === grupo.id
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={on}
              onClick={() => setGrupoId(g.id)}
              data-testid={`it-grupo-${g.id}`}
              className={cn(
                "h-8 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
              )}
            >
              {g.nombre}
              {conteo[g.id] > 0 && <span className="ml-1.5 tabular-nums opacity-80">· {conteo[g.id]}</span>}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="inline-flex items-center gap-2 text-sm">
          <Switch checked={soloAlertas} onCheckedChange={setSoloAlertas} aria-label="Mostrar solo celdas con alerta" />
          Solo celdas con alerta
        </label>
        <Input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar región o categoría"
          aria-label="Buscar región o categoría"
          className="h-8 max-w-64"
        />
        <span className="text-xs text-muted-foreground" role="status">
          {filas.length} de {grupo.celdas.length} celdas
        </span>
      </div>

      {filas.length === 0 ? (
        <p className="text-sm">{soloAlertas ? "Ninguna celda de este grupo tiene alertas." : "Sin celdas que coincidan."}</p>
      ) : (
        <div className="max-h-[560px] overflow-auto">
          <Table className="[&_th]:whitespace-normal">
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>Celda</TableHead>
                <TableHead className="text-right" title="Hogares de esta corrida y su promedio mensual de los últimos 12 meses">Hogares</TableHead>
                <TableHead className="text-right" title="Peso medio de esta corrida y su media de los últimos 12 meses">Peso medio</TableHead>
                <TableHead>Alerta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((c) => {
                const dh = variacion(c.hogares, c.hogares_12m)
                const dp = variacion(c.peso_medio, c.peso_medio_12m)
                const compara = c.hogares_12m >= 30
                return (
                  <TableRow key={c.uig} data-testid={`it-celda-${c.uig}`} className="align-top">
                    <TableCell className={cn("min-w-36 whitespace-normal", c.nivel > 1 && "pl-6")}>
                      {nombreCelda(c)}
                      {c.junta && (
                        <span className="block text-xs text-muted-foreground">
                          {c.junta.lado === "sale" ? "Junta con " : "Recibe a "}
                          {c.junta.con} ({c.junta.motivo === "N_Elg=0" ? "sin hogares" : "peso extremo"}
                          {c.junta.excepcion ? ", excepción de Marginales" : ""})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="font-medium">{num(c.hogares)}</span>
                      <span className="block text-xs text-muted-foreground">
                        12 m: {num(c.hogares_12m)}
                        {compara && ` (${pctSigno(dh)})`}
                      </span>
                    </TableCell>
                    <TableCell
                      className="text-right tabular-nums"
                      title={`Límites del proceso: ${num(c.limite_inf)} – ${num(c.limite_sup)}${c.peso_medio_publicado != null ? ` · publicado: ${num(c.peso_medio_publicado)}` : ""}`}
                    >
                      <span className="font-medium">{num(c.peso_medio)}</span>
                      <span className="block text-xs text-muted-foreground">
                        12 m: {num(c.peso_medio_12m)}
                        {compara && ` (${pctSigno(dp)})`}
                      </span>
                    </TableCell>
                    <TableCell className="min-w-36 whitespace-normal text-sm">
                      {c.motivos.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <ul style={textoTono(TONO[c.estado])} className="space-y-0.5">
                          {c.motivos.map((m) => (
                            <li key={m}>{m}</li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Seccion>
  )
}

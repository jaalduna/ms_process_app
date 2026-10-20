import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { err, num, pct, TONO, textoTono } from "../format"
import type { AjustesPesaje, ResultadoPesaje } from "../types"
import { Seccion } from "./piezas"
import { CeldasUniverso, RevisionHistoria } from "./RevisionPesaje"

export function ResultadoPesajeView({ resultado, ajustes, onAjustes, puedeVetar = true }: {
  resultado: ResultadoPesaje
  ajustes: AjustesPesaje
  onAjustes: (a: AjustesPesaje) => void
  /** Con el proceso real todavía no se pueden vetar juntas. */
  puedeVetar?: boolean
}) {
  const [idpesoRev, setIdpesoRev] = useState<string | null>(null)
  const revision = resultado.revision?.find((r) => r.idpeso === idpesoRev) ?? resultado.revision?.[0]
  const segmentos = resultado.segmentos?.find((r) => r.idpeso === revision?.idpeso) ?? resultado.segmentos?.[0]
  const unidades = resultado.unidad === "hogar" ? "Hogares" : "Individuos"
  const vetar = (id: string) => {
    const vetadas = ajustes.juntas_vetadas.includes(id)
      ? ajustes.juntas_vetadas.filter((j) => j !== id)
      : [...ajustes.juntas_vetadas, id]
    onAjustes({ ...ajustes, juntas_vetadas: vetadas })
  }

  return (
    <div className="space-y-5">
      <Seccion titulo="Resultado por IdPeso" detalle={`Meta: error final bajo ${err(resultado.meta_error)} y cero outliers`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>IdPeso</TableHead>
              <TableHead className="text-right">{unidades} pesados</TableHead>
              <TableHead className="text-right">Error inicial</TableHead>
              <TableHead className="text-right">Error final</TableHead>
              <TableHead className="text-right">Outliers</TableHead>
              <TableHead className="text-right">Juntas</TableHead>
              <TableHead className="text-right" title="Hogares cuyo peso difiere del publicado para este período">Dif. vs publicado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resultado.idpesos.map((p) => {
              const errOk = p.error_final < resultado.meta_error
              return (
                <TableRow key={p.id} data-testid={`it-idpeso-${p.id}`}>
                  <TableCell className="font-medium">{p.nombre}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(p.pesados)}</TableCell>
                  <TableCell className="text-right tabular-nums">{err(p.error_inicial)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums" style={textoTono(errOk ? TONO.ok : TONO.error)}>
                    {err(p.error_final)}
                  </TableCell>
                  <TableCell
                    className="text-right font-semibold tabular-nums"
                    style={textoTono(p.outliers === 0 ? TONO.ok : TONO.error)}
                  >
                    {num(p.outliers)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{num(p.juntas)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {num(p.diferencia_actual)} {resultado.unidad === "hogar" ? "hogares" : "individuos"}
                    {p.dif_mediana != null && p.diferencia_actual > 0 && (
                      <span
                        className="block text-xs text-muted-foreground"
                        title={`Diferencia por hogar contra el peso publicado. p90: ${pct(p.dif_p90 ?? 0)}`}
                      >
                        mediana {pct(p.dif_mediana)} · {pct(p.dif_sobre_5 ?? 0, 0)} sobre 5 %
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Seccion>

      {revision && (
        <>
          {(resultado.revision?.length ?? 0) > 1 && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="IdPeso a revisar">
              <span className="text-sm font-medium">Revisar:</span>
              {resultado.revision!.map((r) => {
                const on = r.idpeso === revision.idpeso
                const nombre = resultado.idpesos.find((i) => i.id === r.idpeso)?.nombre ?? r.idpeso
                return (
                  <button
                    key={r.idpeso}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setIdpesoRev(r.idpeso)}
                    className={cn(
                      "h-8 rounded-full border px-3 text-xs font-medium",
                      on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
                    )}
                  >
                    {nombre}
                  </button>
                )
              })}
            </div>
          )}
          <RevisionHistoria indicadores={revision.indicadores} />
          {segmentos && <CeldasUniverso key={segmentos.idpeso} grupos={segmentos.grupos} />}
        </>
      )}

      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        <Seccion titulo="Distribución de pesos" detalle="Primer IdPeso elegido · esta vuelta contra el período anterior publicado">
          <Histograma h={resultado.histograma} />
        </Seccion>

        <Seccion
          titulo={puedeVetar ? "Juntas de marginales propuestas" : `Juntas de celdas (${resultado.juntas.length})`}
          detalle={
            puedeVetar
              ? "Las propone el IPF para resolver outliers. Vetar una la saca de la próxima vuelta."
              : "Las que hizo el proceso: celdas sin hogares o con pesos extremos. Vetarlas desde aquí viene en la próxima versión."
          }
        >
          {resultado.juntas.length === 0 ? (
            <p className="text-sm">No hacen falta juntas con estos parámetros.</p>
          ) : (
            <ul className={cn("space-y-2", !puedeVetar && "max-h-96 overflow-auto")}>
              {resultado.juntas.map((j) => (
                <li
                  key={j.id}
                  className={cn("flex items-center justify-between gap-3 rounded-md px-3 py-2", j.vetada ? "bg-muted" : "bg-accent")}
                  data-testid={`it-junta-${j.id}`}
                >
                  <span className={cn("text-sm", j.vetada && "text-muted-foreground line-through")}>
                    <span className="font-medium">{j.region}</span> · {j.detalle}
                    {j.motivo && (
                      <span className="text-muted-foreground"> · {j.motivo === "N_Elg=0" ? "sin hogares" : "peso extremo"}</span>
                    )}
                  </span>
                  {puedeVetar && <Button
                    variant="outline"
                    size="sm"
                    onClick={() => vetar(j.id)}
                    aria-label={`${j.vetada ? "Restaurar" : "Vetar"} junta ${j.region}, ${j.detalle}`}
                  >
                    {j.vetada ? "Restaurar" : "Vetar"}
                  </Button>}
                </li>
              ))}
            </ul>
          )}
        </Seccion>
      </div>
    </div>
  )
}

function Histograma({ h }: { h: ResultadoPesaje["histograma"] }) {
  const max = Math.max(1, ...h.anterior, ...h.actual)
  const fuera = h.fuera.filter(Boolean).length
  return (
    <div className="space-y-3">
      <div
        className="flex h-40 items-end gap-1.5 border-b"
        role="img"
        aria-label={`Histograma de pesos: esta vuelta contra ${h.periodo_anterior}; ${fuera} tramos con pesos fuera de límites`}
      >
        {h.anterior.map((a, i) => (
          <div key={i} className="flex h-full flex-1 items-end gap-0.5">
            <div className="flex-1 rounded-t-sm bg-muted-foreground/35" style={{ height: `${(a / max) * 100}%` }} />
            <div
              className="flex-1 rounded-t-sm"
              style={{ height: `${(h.actual[i] / max) * 100}%`, background: h.fuera[i] ? "#f871a0" : "var(--qf-wp-blue)" }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>peso bajo</span>
        <span>peso alto</span>
      </div>
      <div className="flex flex-wrap gap-4 text-xs">
        <Leyenda color="color-mix(in oklch, var(--muted-foreground) 35%, transparent)">{h.periodo_anterior}</Leyenda>
        <Leyenda color="var(--qf-wp-blue)">Esta vuelta</Leyenda>
        <Leyenda color="#f871a0">Fuera de límites</Leyenda>
      </div>
    </div>
  )
}

function Leyenda({ color, children }: { color: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-3 rounded-sm" style={{ background: color }} aria-hidden />
      {children}
    </span>
  )
}

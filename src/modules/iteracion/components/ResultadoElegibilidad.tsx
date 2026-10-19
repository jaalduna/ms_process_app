import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { num, pct, pp, periodoLabel, TONO, textoTono } from "../format"
import type { AjustesElegibilidad, RegionElegibilidad, ResultadoElegibilidad } from "../types"
import { Seccion } from "./piezas"

const ESTADO: Record<RegionElegibilidad["estado"], { texto: string; tono: string; relleno: string }> = {
  ok: { texto: "OK", tono: TONO.ok, relleno: "var(--qf-wp-blue)" },
  justo: { texto: "Justo", tono: TONO.aviso, relleno: "var(--warning)" },
  deficit: { texto: "Déficit", tono: TONO.error, relleno: "#f871a0" },
  cerrada: { texto: "Sin imputar", tono: TONO.neutro, relleno: "var(--muted-foreground)" },
}

export function ResultadoElegibilidadView({ resultado, ajustes, onAjustes }: {
  resultado: ResultadoElegibilidad
  ajustes: AjustesElegibilidad
  onAjustes: (a: AjustesElegibilidad) => void
}) {
  const alternar = (id: string) => {
    const cerradas = ajustes.regiones_cerradas.includes(id)
      ? ajustes.regiones_cerradas.filter((r) => r !== id)
      : [...ajustes.regiones_cerradas, id]
    onAjustes({ regiones_cerradas: cerradas })
  }

  return (
    <div className="space-y-5">
      <div
        className="rounded-lg border px-4 py-3"
        style={{ borderColor: "color-mix(in oklch, var(--qf-wp-blue) 40%, transparent)", background: "color-mix(in oklch, var(--qf-wp-blue) 9%, transparent)" }}
        data-testid="it-revision"
      >
        <div className="font-semibold">Revisión antes de imputar</div>
        <p className="text-sm">
          Con estos parámetros se imputarían <strong>{num(resultado.revision.hogares_imputar)} hogares</strong> en{" "}
          {resultado.revision.regiones_con_imputacion} regiones. Nada se escribe hasta aprobar.
        </p>
      </div>

      <Seccion
        titulo="Muestra por región contra la muestra ideal"
        detalle={`R_Regiones · la marca vertical es el mínimo para estar OK (${pct(resultado.f_ok, 0)})`}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Región</TableHead>
              <TableHead className="text-right">Ideal</TableHead>
              <TableHead className="text-right">Natural</TableHead>
              <TableHead className="text-right">Imputados</TableHead>
              <TableHead className="min-w-36">Cumplimiento</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>
                <span className="sr-only">Acción</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resultado.regiones.map((r) => {
              const e = ESTADO[r.estado]
              const cerrada = r.estado === "cerrada"
              return (
                <TableRow key={r.id} data-testid={`it-region-${r.id}`}>
                  <TableCell className="font-medium">{r.nombre}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(r.ideal)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(r.natural)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(r.imputados)}</TableCell>
                  <TableCell>
                    <div className="relative h-2.5 rounded-full bg-muted" aria-hidden>
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{ width: `${Math.min(100, r.cumplimiento * 100)}%`, background: e.relleno }}
                      />
                      <div
                        className="absolute -inset-y-1 w-0.5 bg-foreground"
                        style={{ left: `${resultado.f_ok * 100}%` }}
                      />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {pct(r.cumplimiento)} · {num(r.final)} final
                    </div>
                  </TableCell>
                  <TableCell className="font-semibold" style={textoTono(e.tono)}>
                    {e.texto}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => alternar(r.id)}
                      aria-label={cerrada ? `Volver a imputar en ${r.nombre}` : `No imputar en ${r.nombre}`}
                    >
                      {cerrada ? "Reabrir" : "Cerrar"}
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Seccion>

      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        <Seccion titulo="Tendencia del % imputado" detalle="Últimos cierres publicados y esta vuelta">
          <Tendencia puntos={resultado.tendencia} />
          <div className="grid grid-cols-3 gap-2">
            {resultado.comparaciones.map((c) => (
              <div key={c.etiqueta} className="rounded-md bg-muted px-3 py-2">
                <div className="text-xs text-muted-foreground">{c.etiqueta}</div>
                <div
                  className="font-semibold tabular-nums"
                  style={Math.abs(c.delta_pp) > 1 ? textoTono(TONO.error) : undefined}
                >
                  {pp(c.delta_pp)}
                </div>
              </div>
            ))}
          </div>
        </Seccion>

        <Seccion titulo="Uso de donantes" detalle="Rep_Dons · cuántas veces se repite cada donante">
          <Donantes donantes={resultado.donantes} />
          <p className="text-xs text-muted-foreground">
            El detalle por hogar (Domicilios_Imput, Actos_Imput, Actos_Elim, ElgNat_Inconsist) se descarga al publicar.
          </p>
        </Seccion>
      </div>
    </div>
  )
}

function Tendencia({ puntos }: { puntos: ResultadoElegibilidad["tendencia"] }) {
  if (puntos.length === 0) return null
  const W = 520
  const H = 160
  const max = Math.max(...puntos.map((p) => p.pct_imputado)) * 1.25 || 1
  const x = (i: number) => 24 + (i * (W - 48)) / Math.max(1, puntos.length - 1)
  const y = (v: number) => H - 24 - (v / max) * (H - 40)
  const linea = puntos.map((p, i) => `${x(i)},${y(p.pct_imputado)}`).join(" ")
  const actual = puntos.findIndex((p) => p.actual)
  const ultimo = puntos[puntos.length - 1]
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`% imputado de ${periodoLabel(puntos[0].periodo)} a ${periodoLabel(ultimo.periodo)}; esta vuelta ${pct(ultimo.pct_imputado)}`}
    >
      <line x1={24} x2={W - 24} y1={H - 24} y2={H - 24} stroke="var(--border)" />
      <polyline points={linea} fill="none" stroke="var(--qf-wp-blue)" strokeWidth={2.5} strokeLinejoin="round" />
      {actual >= 0 && (
        <>
          <circle cx={x(actual)} cy={y(puntos[actual].pct_imputado)} r={6} fill="var(--primary)" />
          <text x={x(actual)} y={y(puntos[actual].pct_imputado) - 12} textAnchor="end" fontSize={12} fill="var(--foreground)">
            {pct(puntos[actual].pct_imputado)}
          </text>
        </>
      )}
      <text x={24} y={H - 6} fontSize={11} fill="var(--muted-foreground)">
        {periodoLabel(puntos[0].periodo)}
      </text>
      <text x={W - 24} y={H - 6} fontSize={11} textAnchor="end" fill="var(--muted-foreground)">
        {periodoLabel(ultimo.periodo)}
      </text>
    </svg>
  )
}

function Donantes({ donantes }: { donantes: ResultadoElegibilidad["donantes"] }) {
  const max = Math.max(1, ...donantes.map((d) => d.hogares))
  return (
    <ul className="space-y-2">
      {donantes.map((d) => (
        <li key={d.usos} className="grid grid-cols-[80px_minmax(0,1fr)_64px] items-center gap-3 text-sm">
          <span>{d.usos === 1 ? "1 uso" : `${d.usos} usos`}</span>
          <div className="h-3 rounded bg-muted" aria-hidden>
            <div
              className="h-3 rounded"
              style={{ width: `${(d.hogares / max) * 100}%`, background: d.usos >= 4 ? "#f871a0" : "var(--qf-wp-blue)" }}
            />
          </div>
          <span className="text-right tabular-nums">{num(d.hogares)}</span>
        </li>
      ))}
    </ul>
  )
}

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TONO, textoTono } from "../format"
import type { IndicadorRevision } from "../types"

const es = "es-CL"

/** Qué mide cada indicador, tal como lo calcula el Pesaje (runner_pesaje._indicadores_mes). */
const QUE_MIDE: Record<string, string> = {
  hogares: "Cantidad de hogares que reciben peso en este IdPeso.",
  eficiencia:
    "Eficiencia de Kish: (Σ pesos)² / (n · Σ pesos²), en %. Vale 100 % si todos los pesos fueran iguales y baja a medida que los pesos se dispersan; una eficiencia baja significa que la muestra rinde como una más chica.",
  cambio_20:
    "De los hogares que también tenían peso el mes anterior, qué porcentaje cambió su peso en más de 20 %, hacia arriba o hacia abajo.",
  max_mediana:
    "Peso del hogar más pesado dividido por el peso mediano. Si sube, hay hogares que pesan desproporcionadamente.",
  error_final: "Error que queda al terminar el ajuste de pesos (IPF) contra el universo. La meta es quedar bajo la tolerancia.",
  juntas: "Celdas del universo que se juntaron con otras porque tenían pocos hogares.",
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
/** 202509 → «sep 25». */
const mes = (p: string) => (/^\d{6}$/.test(p) ? `${MESES[Number(p.slice(4)) - 1]} ${p.slice(2, 4)}` : p)

const signo = (d: number, f: (x: number) => string) => `${d > 0 ? "+" : d < 0 ? "−" : ""}${f(Math.abs(d))}`
const pctRel = (a: number, b: number) =>
  b ? signo(a / b - 1, (x) => `${(x * 100).toLocaleString(es, { maximumFractionDigits: 1 })} %`) : "—"

/** Detalle de un indicador de la revisión: qué mide, sus 12 meses con la banda normal y cada valor. */
export function DetalleIndicador({ indicador: i, valor, estadoTexto, onClose }: {
  indicador: IndicadorRevision | null
  valor: (i: IndicadorRevision, v: number | null | undefined) => string
  estadoTexto: string
  onClose: () => void
}) {
  return (
    <Dialog open={!!i} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-testid="it-rev-detalle">
        {i && (
          <>
            <DialogHeader>
              <DialogTitle>{i.etiqueta}</DialogTitle>
              <DialogDescription>{QUE_MIDE[i.id] ?? i.regla}</DialogDescription>
            </DialogHeader>
            <Cifras i={i} valor={valor} estadoTexto={estadoTexto} />
            {i.serie.filter((p) => p.valor != null).length >= 2 ? (
              <>
                <Grafico i={i} valor={valor} />
                <Meses i={i} valor={valor} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{i.regla}.</p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Cifras({ i, valor, estadoTexto }: { i: IndicadorRevision; valor: DetalleProps["valor"]; estadoTexto: string }) {
  const alerta = i.estado === "aviso" || i.estado === "error"
  const items: { t: string; v: string; d?: string }[] = [
    { t: "Esta corrida", v: valor(i, i.valor), d: i.estado !== "neutro" ? estadoTexto : undefined },
  ]
  if (i.mes_anterior != null) items.push({ t: "Mes anterior", v: valor(i, i.mes_anterior), d: `${pctRel(i.valor, i.mes_anterior)} esta corrida` })
  if (i.media12 != null) items.push({ t: "Media 12 meses", v: valor(i, i.media12), d: `${pctRel(i.valor, i.media12)} esta corrida` })
  if (i.min12 != null && i.max12 != null) items.push({ t: "Rango normal", v: `${valor(i, i.min12)} – ${valor(i, i.max12)}`, d: "mínimo y máximo" })
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((x, k) => (
        <div key={x.t} className="rounded-lg border px-3 py-2">
          <dt className="text-xs text-muted-foreground">{x.t}</dt>
          <dd className="text-lg font-semibold tabular-nums" style={k === 0 && alerta ? textoTono(TONO[i.estado as "aviso" | "error"]) : undefined}>
            {x.v}
          </dd>
          {x.d && <dd className="text-xs text-muted-foreground">{x.d}</dd>}
        </div>
      ))}
    </dl>
  )
}

type DetalleProps = Parameters<typeof DetalleIndicador>[0]

/** Los 12 meses y esta corrida, con la banda mínimo–máximo y la media. */
function Grafico({ i, valor }: { i: IndicadorRevision; valor: DetalleProps["valor"] }) {
  const pts = i.serie.filter((p) => p.valor != null) as { periodo: string; valor: number }[]
  const todos = [...pts.map((p) => p.valor), i.valor, i.min12 ?? i.valor, i.max12 ?? i.valor]
  const pad = (Math.max(...todos) - Math.min(...todos)) * 0.12 || Math.abs(i.valor) * 0.05 || 1
  const lo = Math.min(...todos) - pad
  const hi = Math.max(...todos) + pad
  const W = 600
  const H = 220
  const L = 64
  const R = 16
  const T = 12
  const B = 28
  const n = pts.length + 1
  const x = (k: number) => L + (k / (n - 1)) * (W - L - R)
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
  const alerta = i.estado === "aviso" || i.estado === "error"
  // el diálogo va en un portal fuera de `.qf`: el color va directo, no por su variable
  const color = alerta ? "#f871a0" : "#00A8B8"
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${i.etiqueta}: últimos ${pts.length} meses y esta corrida`}>
      {i.min12 != null && i.max12 != null && (
        <>
          <rect x={L} width={W - L - R} y={y(i.max12)} height={Math.max(1, y(i.min12) - y(i.max12))} fill="currentColor" fillOpacity={0.07} />
          {[i.max12, i.min12].map((v) => (
            <text key={v} x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
              {valor(i, v)}
            </text>
          ))}
        </>
      )}
      {i.media12 != null && (
        <line x1={L} x2={W - R} y1={y(i.media12)} y2={y(i.media12)} stroke="currentColor" strokeOpacity={0.35} strokeDasharray="4 4" />
      )}
      <polyline
        points={pts.map((p, k) => `${x(k)},${y(p.valor)}`).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.6}
        strokeWidth={1.75}
      />
      <line x1={x(n - 2)} x2={x(n - 1)} y1={y(pts[pts.length - 1].valor)} y2={y(i.valor)} stroke={color} strokeDasharray="3 3" strokeWidth={1.5} />
      {pts.map((p, k) => (
        <circle key={p.periodo} cx={x(k)} cy={y(p.valor)} r={2.5} fill="currentColor" fillOpacity={0.6}>
          <title>{`${mes(p.periodo)}: ${valor(i, p.valor)}`}</title>
        </circle>
      ))}
      <circle cx={x(n - 1)} cy={y(i.valor)} r={5} fill={color}>
        <title>{`Esta corrida: ${valor(i, i.valor)}`}</title>
      </circle>
      {[...pts.map((p) => mes(p.periodo)), "esta corrida"].map((t, k) =>
        k % 2 === (n - 1) % 2 ? (
          <text key={t} x={x(k)} y={H - 8} textAnchor={k === n - 1 ? "end" : "middle"} className="fill-muted-foreground text-[11px]">
            {t}
          </text>
        ) : null,
      )}
    </svg>
  )
}

function Meses({ i, valor }: { i: IndicadorRevision; valor: DetalleProps["valor"] }) {
  const pts = (i.serie.filter((p) => p.valor != null) as { periodo: string; valor: number }[]).slice().reverse()
  const fuera = (v: number) => i.min12 != null && i.max12 != null && (v < i.min12 || v > i.max12)
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Mes</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          {i.media12 != null && <TableHead className="text-right">Contra la media</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow className="font-semibold">
          <TableCell>Esta corrida</TableCell>
          <TableCell className="text-right tabular-nums" style={fuera(i.valor) ? textoTono(TONO.aviso) : undefined}>
            {valor(i, i.valor)}
          </TableCell>
          {i.media12 != null && <TableCell className="text-right tabular-nums">{pctRel(i.valor, i.media12)}</TableCell>}
        </TableRow>
        {pts.map((p) => (
          <TableRow key={p.periodo}>
            <TableCell>{mes(p.periodo)}</TableCell>
            <TableCell className="text-right tabular-nums">{valor(i, p.valor)}</TableCell>
            {i.media12 != null && <TableCell className="text-right tabular-nums text-muted-foreground">{pctRel(p.valor, i.media12)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

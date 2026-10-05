import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { formatChile } from "../time"
import { SHEET_LABELS, type QmsTrResultado, type QmsTrValidacion } from "../types"

const ESTADO: Record<QmsTrValidacion["status"], { label: string; className: string }> = {
  aplicado: { label: "Cambios aplicados en J", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  parcial: { label: "Aplicación parcial", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  no_aplicado: { label: "Cambios no aplicados", className: "bg-destructive/15 text-destructive" },
}

const RESULTADO: Record<QmsTrResultado, string> = {
  aplicado: "text-emerald-700 dark:text-emerald-400",
  pendiente: "text-amber-700 dark:text-amber-400",
  distinto: "text-destructive",
}

function fmt(v: number | string | null): string {
  if (v === null || v === undefined) return "—"
  return typeof v === "number" ? v.toLocaleString("es-CL", { maximumFractionDigits: 4 }) : v
}

/** Resultado de "Validar aplicación en J": resumen por hoja + muestra revisada. */
export function QmsTrValidationPanel({ validacion }: { validacion: QmsTrValidacion }) {
  const estado = ESTADO[validacion.status]
  const noAplicadas = validacion.rows.filter((r) => r.resultado !== "aplicado")
  return (
    <div className="space-y-3 rounded-md border px-3 py-3" data-testid="qmstr-validacion">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge className={cn("border-transparent", estado.className)}>{estado.label}</Badge>
        <span className="text-muted-foreground">
          {validacion.applied} de {validacion.checked} filas revisadas están en J
          {validacion.pending > 0 && ` · ${validacion.pending} pendientes`}
          {validacion.mismatched > 0 && ` · ${validacion.mismatched} con otro valor`}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          Validado a las {formatChile(validacion.validated_at)}
          {validacion.validated_by ? ` por ${validacion.validated_by}` : ""}
        </span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Hoja</TableHead>
            <TableHead className="text-right">Filas del entregable</TableHead>
            <TableHead className="text-right">Revisadas</TableHead>
            <TableHead className="text-right">Aplicadas</TableHead>
            <TableHead className="text-right">Pendientes</TableHead>
            <TableHead className="text-right">Otro valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Object.entries(SHEET_LABELS).map(([slug, label]) => {
            const h = validacion.by_sheet[slug]
            if (!h) return null
            return (
              <TableRow key={slug} data-testid={`qmstr-validacion-${slug}`}>
                <TableCell>{label}</TableCell>
                <TableCell className="text-right tabular-nums">{h.total.toLocaleString("es-CL")}</TableCell>
                <TableCell className="text-right tabular-nums">{h.checked}</TableCell>
                <TableCell className="text-right tabular-nums">{h.applied}</TableCell>
                <TableCell className="text-right tabular-nums">{h.pending}</TableCell>
                <TableCell className="text-right tabular-nums">{h.mismatched}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {noAplicadas.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Ver las {noAplicadas.length} filas que no coinciden
          </summary>
          <Table className="mt-2">
            <TableHeader>
              <TableRow>
                <TableHead>Hoja</TableHead>
                <TableHead>IdAto</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Variable</TableHead>
                <TableHead className="text-right">Pedido</TableHead>
                <TableHead className="text-right">En J</TableHead>
                <TableHead className="text-right">Antes</TableHead>
                <TableHead>Resultado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {noAplicadas.map((r) => (
                <TableRow key={`${r.sheet}-${r.id_ato}-${r.variable}`}>
                  <TableCell>{r.sheet}</TableCell>
                  <TableCell className="font-mono text-xs">{r.id_ato}</TableCell>
                  <TableCell className="font-mono text-xs">{r.id_produto ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.variable ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.esperado)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.actual)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.anterior)}</TableCell>
                  <TableCell className={cn("text-xs font-medium", RESULTADO[r.resultado])}>{r.resultado}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </details>
      )}
    </div>
  )
}

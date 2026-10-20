import { Fragment, useMemo, useState } from "react"
import { ChevronRight, Search, TriangleAlert, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { formatChile } from "../../time"
import { ESTADO_TANDA_LABEL, estadosBase, type Entrega, type EstadoBase, type FlujoBase } from "../../types"
import { Chip, ChipBase, Vacio } from "./piezas"

function Hora({ iso, anulado }: { iso: string | null; anulado?: boolean }) {
  if (!iso) return <span className="text-muted-foreground/60">—</span>
  return (
    <time dateTime={iso} className={cn("tabular-nums", anulado && "text-muted-foreground line-through")} title={anulado ? "Anulado" : undefined}>
      {formatChile(iso)}
    </time>
  )
}

interface TablaBasesProps {
  bases: FlujoBase[]
  filtro: EstadoBase | null
  onFiltro: (e: EstadoBase | null) => void
  entrega?: Entrega
}

/** Grilla de bases con hitos 3/4/10, tanda y el historial de cada una (fila expandible). */
export function TablaBases({ bases, filtro, onFiltro, entrega = "ticket" }: TablaBasesProps) {
  const [q, setQ] = useState("")
  const [abierta, setAbierta] = useState<number | null>(null)
  const filas = useMemo(() => {
    const t = q.trim().toLowerCase()
    return bases.filter((b) => (!filtro || b.estado === filtro)
      && (!t || b.nombre.toLowerCase().includes(t) || String(b.producto).includes(t)))
  }, [bases, filtro, q])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar base o código" className="pl-8" aria-label="Buscar base" />
        </div>
        {filtro && (
          <button type="button" onClick={() => onFiltro(null)}
            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs hover:bg-muted">
            Solo: {estadosBase(entrega).find((e) => e.estado === filtro)?.label} <X className="size-3" />
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{filas.length} de {bases.length}</span>
      </div>

      {filas.length === 0 ? (
        <Vacio icon={<Search />} titulo="Ninguna base coincide">Prueba con otro nombre o quita el filtro de estado.</Vacio>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table data-testid="qf-tabla-bases">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8" />
                <TableHead>Base</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>{entrega === "pythoncac" ? "Distribución (hito 3)" : "Hito 3"}</TableHead>
                <TableHead>Hito 4</TableHead>
                <TableHead>Hito 10</TableHead>
                <TableHead>Tanda</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((b) => {
                const open = abierta === b.producto
                return (
                  <Fragment key={b.producto}>
                    <TableRow
                      data-producto={b.producto}
                      className={cn("cursor-pointer", open && "bg-muted/40")}
                      onClick={() => setAbierta(open ? null : b.producto)}
                    >
                      <TableCell className="pr-0">
                        <button type="button" aria-expanded={open} aria-label={`Historial de ${b.nombre}`}
                          className="grid size-6 place-items-center rounded hover:bg-muted">
                          <ChevronRight className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-90")} />
                        </button>
                      </TableCell>
                      <TableCell>
                        <span className="mr-2 text-xs text-muted-foreground tabular-nums">{b.producto}</span>
                        <span className="font-medium">{b.nombre}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <ChipBase estado={b.estado} tandaEstado={b.tanda_estado} entrega={entrega} />
                          {b.revisar && (
                            <Chip tone="var(--qf-retenida)" title={b.revisar} data-testid="qf-revisar">
                              <TriangleAlert className="size-3" /> Revisar
                            </Chip>
                          )}
                        </div>
                        {b.motivo_bypass && (
                          <p className="mt-1 max-w-80 text-xs text-muted-foreground" data-testid="qf-motivo-bypass">{b.motivo_bypass}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-xs"><Hora iso={b.h3} /></TableCell>
                      <TableCell className="text-xs"><Hora iso={b.h4} anulado={b.h4_anulado} /></TableCell>
                      <TableCell className="text-xs"><Hora iso={b.h10} /></TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {b.tanda_numero !== null ? (
                          <>
                            <span className="font-medium">N.º {b.tanda_numero}</span>
                            <span className="text-muted-foreground"> {b.tanda_estado ? ESTADO_TANDA_LABEL[b.tanda_estado].toLowerCase() : ""}</span>
                            {b.jira_key && <span className="ml-1.5 text-muted-foreground">{b.jira_key}</span>}
                          </>
                        ) : <span className="text-muted-foreground/60">—</span>}
                      </TableCell>
                    </TableRow>
                    {open && (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell />
                        <TableCell colSpan={6} className="pb-4">
                          {b.revisar && (
                            <p className="mb-2 text-xs"><span className="font-semibold">Revisar antes del ticket:</span> {b.revisar}</p>
                          )}
                          {b.historial.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Esta base todavía no pasa por QMS-TR.</p>
                          ) : (
                            <ol className="space-y-1 text-xs">
                              {b.historial.map((h, i) => (
                                <li key={i} className="flex gap-3">
                                  <time className="w-24 shrink-0 text-muted-foreground tabular-nums">{formatChile(h.at)}</time>
                                  <span>{h.evento}</span>
                                </li>
                              ))}
                            </ol>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2, Plus, RotateCcw, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useParamsTable, usePublishParams } from "../hooks"
import { cambiosExclusiones, GRUPO_EXCATEG, separarExclusiones, unirExclusiones, type Exclusion, type Producto } from "../exclusiones"
import type { CriteriosExCategRow, ImputacionExCategRow } from "../types"

/**
 * «Productos excluidos»: `Criterios_Elegibilidad_ExCateg` (no cuentan para decidir si un hogar es
 * elegible, en las reglas con ExCateg «A») e `Imputacion_ExCateg` (sus compras no se copian de los
 * donantes) editadas como una sola lista, con el nombre de cada producto. Al publicar se escriben
 * las dos tablas, igual que antes.
 */
export function ProductosExcluidos({ codigo, productos, onPublicado }: {
  codigo: string
  /** Nombres del catálogo del país; undefined mientras cargan, null si no se pudieron leer. */
  productos: Producto[] | null | undefined
  onPublicado?: () => void
}) {
  const crit = useParamsTable("Criterios_Elegibilidad_ExCateg", codigo)
  const imp = useParamsTable("Imputacion_ExCateg", codigo)

  if (crit.isLoading || imp.isLoading) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Cargando productos excluidos…
      </p>
    )
  }
  if (crit.isError || imp.isError || !crit.data || !imp.data) {
    return <p className="text-sm text-destructive" role="alert">No se pudieron leer las tablas de productos excluidos.</p>
  }
  const criterios = crit.data.rows as CriteriosExCategRow[]
  const otros = [...new Set(criterios.map((r) => r.ExCateg).filter((g) => g !== GRUPO_EXCATEG))]
  if (otros.length) {
    // con más de un grupo, una sola columna «No cuenta para elegibilidad» no alcanza para decir a cuál va
    return (
      <p className="rounded-md border px-3 py-2 text-sm" role="alert">
        Este país usa más de un grupo de excepción ({[GRUPO_EXCATEG, ...otros].join(", ")}). Edítalo en «Más tablas ›
        Criterios_Elegibilidad_ExCateg».
      </p>
    )
  }
  return (
    <Editor
      key={`${crit.dataUpdatedAt}-${imp.dataUpdatedAt}`}
      codigo={codigo}
      base={unirExclusiones(criterios, imp.data.rows as ImputacionExCategRow[])}
      productos={productos}
      onPublicado={onPublicado}
    />
  )
}

function Editor({ codigo, base, productos, onPublicado }: {
  codigo: string
  base: Exclusion[]
  productos: Producto[] | null | undefined
  onPublicado?: () => void
}) {
  const qc = useQueryClient()
  const pubCrit = usePublishParams("Criterios_Elegibilidad_ExCateg", codigo)
  const pubImp = usePublishParams("Imputacion_ExCateg", codigo)
  const [filas, setFilas] = useState<Exclusion[]>(base)
  const [buscar, setBuscar] = useState("")
  const [revisar, setRevisar] = useState(false)
  const nombres = useMemo(() => new Map((productos ?? []).map((p) => [p.id, p.nombre])), [productos])
  const cambios = useMemo(() => cambiosExclusiones(base, filas), [base, filas])
  const n =
    cambios.elegibilidad.agrega.length + cambios.elegibilidad.quita.length + cambios.imputacion.agrega.length + cambios.imputacion.quita.length
  const publicando = pubCrit.isPending || pubImp.isPending

  const nombre = (id: number) => nombres.get(id) ?? (productos === undefined ? "…" : "Sin nombre en el catálogo")
  const agregar = (id: number) => {
    if (filas.some((f) => f.id === id)) {
      toast.info(`El producto ${id} ya está en la lista`)
      return
    }
    // un producto nuevo parte excluido de las dos cosas; se desmarca lo que no corresponda
    setFilas((f) => [...f, { id, elegibilidad: true, imputacion: true }].sort((a, b) => a.id - b.id))
    setBuscar("")
  }
  const t = buscar.trim()
  const esId = /^\d+$/.test(t)
  const sugeridos =
    t && !esId && productos
      ? productos.filter((p) => p.nombre.toLowerCase().includes(t.toLowerCase()) && !filas.some((f) => f.id === p.id)).slice(0, 8)
      : []

  const marcar = (id: number, k: "elegibilidad" | "imputacion", v: boolean) =>
    setFilas((fs) => fs.map((f) => (f.id === id ? { ...f, [k]: v } : f)))

  const publicar = async () => {
    const { criterios, imputacion } = separarExclusiones(filas)
    const ce = cambios.elegibilidad.agrega.length + cambios.elegibilidad.quita.length > 0
    const ci = cambios.imputacion.agrega.length + cambios.imputacion.quita.length > 0
    try {
      if (ce) await pubCrit.mutateAsync(criterios)
      if (ci) await pubImp.mutateAsync(imputacion)
      toast.success("Productos excluidos publicados", { description: "El próximo cálculo del país ya los usa." })
      setRevisar(false)
      onPublicado?.()
    } catch (e) {
      toast.error("No se pudo publicar", { description: e instanceof Error ? e.message : undefined })
      qc.invalidateQueries({ queryKey: ["eleg-params"] })
    }
  }

  const base1 = new Map(base.map((b) => [b.id, b]))
  const lista = (xs: number[]) => xs.map((x) => `${x} ${nombres.get(x) ? `(${nombres.get(x)})` : ""}`.trim()).join(", ")

  return (
    <div className="space-y-3" data-testid="prod-excluidos">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">No cuenta para elegibilidad:</span> las reglas marcadas «sin productos
        excluidos» cuentan actos, categorías y semanas del hogar sin estos productos.{" "}
        <span className="font-medium text-foreground">No se imputa:</span> sus compras no se copian de los donantes.
      </p>

      <div className="relative max-w-md">
        <div className="flex gap-2">
          <Input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && esId) agregar(Number(t))
              if (e.key === "Enter" && sugeridos.length === 1) agregar(sugeridos[0].id)
            }}
            placeholder={productos ? "Agregar por IdProduto o nombre" : "Agregar por IdProduto"}
            aria-label="Agregar producto"
            className="h-8"
            data-testid="prod-excluidos-agregar"
          />
          <Button size="sm" variant="outline" disabled={!esId} onClick={() => agregar(Number(t))}>
            <Plus aria-hidden /> Agregar
          </Button>
        </div>
        {sugeridos.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover text-sm shadow-md" role="listbox">
            {sugeridos.map((p) => (
              <li key={p.id}>
                <button type="button" className="flex w-full gap-2 px-3 py-1.5 text-left hover:bg-accent" onClick={() => agregar(p.id)}>
                  <span className="w-14 shrink-0 font-mono tabular-nums text-muted-foreground">{p.id}</span>
                  {p.nombre}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {productos === null && (
        <p className="text-xs text-muted-foreground">No se pudo leer el catálogo de productos: se muestran solo los IdProduto.</p>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
              <th className="w-24 px-3 py-2 text-left font-medium">IdProduto</th>
              <th className="px-3 py-2 text-left font-medium">Producto</th>
              <th className="w-44 px-3 py-2 text-center font-medium">No cuenta para elegibilidad</th>
              <th className="w-32 px-3 py-2 text-center font-medium">No se imputa</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                  El país no excluye ningún producto.
                </td>
              </tr>
            )}
            {filas.map((f) => {
              const b = base1.get(f.id)
              const cambiada = !b || b.elegibilidad !== f.elegibilidad || b.imputacion !== f.imputacion
              const vacia = !f.elegibilidad && !f.imputacion
              return (
                <tr key={f.id} className={cn("border-b last:border-0", cambiada && "bg-accent/30", vacia && "opacity-60")} data-testid={`prod-excluido-${f.id}`}>
                  <td className="px-3 py-1.5 font-mono tabular-nums">{f.id}</td>
                  <td className="px-3 py-1.5">{nombre(f.id)}</td>
                  {(["elegibilidad", "imputacion"] as const).map((k) => (
                    <td key={k} className="px-3 py-1.5 text-center">
                      <input
                        type="checkbox"
                        className="size-4 align-middle"
                        checked={f[k]}
                        onChange={(e) => marcar(f.id, k, e.target.checked)}
                        aria-label={`${f.id} ${k === "elegibilidad" ? "no cuenta para elegibilidad" : "no se imputa"}`}
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1.5">
                    <Button variant="ghost" size="icon" className="size-7" aria-label={`Quitar ${f.id}`}
                      onClick={() => setFilas((fs) => fs.filter((x) => x.id !== f.id))}>
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {n > 0 && <span className="mr-auto text-xs text-muted-foreground">{n === 1 ? "1 cambio sin publicar" : `${n} cambios sin publicar`}</span>}
        <Button variant="ghost" size="sm" disabled={n === 0} onClick={() => { setFilas(base); setRevisar(false) }}>
          <RotateCcw aria-hidden /> Descartar
        </Button>
        <Button size="sm" disabled={n === 0} onClick={() => setRevisar(true)} data-testid="prod-excluidos-revisar">
          <Upload aria-hidden /> Revisar y publicar
        </Button>
      </div>

      {revisar && n > 0 && (
        <div className="space-y-2 rounded-lg border p-3 text-sm" data-testid="prod-excluidos-resumen">
          <p className="font-medium">Se publica para todo el país, no solo para esta vuelta:</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {cambios.elegibilidad.agrega.length > 0 && <li>Dejan de contar para elegibilidad: {lista(cambios.elegibilidad.agrega)}</li>}
            {cambios.elegibilidad.quita.length > 0 && <li>Vuelven a contar para elegibilidad: {lista(cambios.elegibilidad.quita)}</li>}
            {cambios.imputacion.agrega.length > 0 && <li>Dejan de imputarse: {lista(cambios.imputacion.agrega)}</li>}
            {cambios.imputacion.quita.length > 0 && <li>Vuelven a imputarse: {lista(cambios.imputacion.quita)}</li>}
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRevisar(false)}>Volver</Button>
            <Button size="sm" onClick={publicar} disabled={publicando} data-testid="prod-excluidos-publicar">
              {publicando && <Loader2 className="animate-spin" aria-hidden />} Publicar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

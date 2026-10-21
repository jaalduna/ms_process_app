// «Productos excluidos»: las dos tablas de exclusión por producto del país como una sola lista.
import type { CriteriosExCategRow, ImputacionExCategRow, ParamRow } from "./types"

/** Único grupo de excepción que usan los países: las reglas con ExCateg «A» se evalúan sin esos productos. */
export const GRUPO_EXCATEG = "A"

export interface Producto {
  id: number
  nombre: string
}

/** Un producto excluido y de qué: de contar para la elegibilidad, de imputarse, o de las dos. */
export interface Exclusion {
  id: number
  elegibilidad: boolean
  imputacion: boolean
}

/** Las dos tablas del país como una sola lista por producto, ordenada por IdProduto. */
export function unirExclusiones(criterios: CriteriosExCategRow[], imputacion: ImputacionExCategRow[]): Exclusion[] {
  const m = new Map<number, Exclusion>()
  const fila = (id: number) => {
    if (!m.has(id)) m.set(id, { id, elegibilidad: false, imputacion: false })
    return m.get(id)!
  }
  for (const r of criterios) fila(Number(r.IdProduto)).elegibilidad = true
  for (const r of imputacion) fila(Number(r.IdProduto)).imputacion = true
  return [...m.values()].sort((a, b) => a.id - b.id)
}

/** De vuelta a las dos tablas; un producto sin ninguna marca no va en ninguna. */
export function separarExclusiones(filas: Exclusion[]): { criterios: ParamRow[]; imputacion: ParamRow[] } {
  return {
    criterios: filas.filter((f) => f.elegibilidad).map((f) => ({ ExCateg: GRUPO_EXCATEG, IdProduto: f.id })),
    imputacion: filas.filter((f) => f.imputacion).map((f) => ({ IdProduto: f.id })),
  }
}

const ids = (filas: Exclusion[], k: "elegibilidad" | "imputacion") =>
  new Set(filas.filter((f) => f[k]).map((f) => f.id))

/** Lo que cambia en cada tabla al publicar. */
export function cambiosExclusiones(antes: Exclusion[], ahora: Exclusion[]) {
  const dif = (k: "elegibilidad" | "imputacion") => {
    const a = ids(antes, k)
    const b = ids(ahora, k)
    return { agrega: [...b].filter((x) => !a.has(x)).sort((x, y) => x - y), quita: [...a].filter((x) => !b.has(x)).sort((x, y) => x - y) }
  }
  return { elegibilidad: dif("elegibilidad"), imputacion: dif("imputacion") }
}

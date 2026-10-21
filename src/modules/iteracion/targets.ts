// Targets por segmento de Elegibilidad (ajuste `muestra_ideal`): lo que se calcula al editar,
// separado de la vista para probarlo sin montar la tabla.
import type { BloqueEstructura, Estructura } from "./types"

export type Cambios = Record<string, number>

/** Target vigente de un segmento: el cambiado, o el del país. */
export function target(cambios: Cambios, secuencia: number, ideal: number): number {
  return cambios[String(secuencia)] ?? ideal
}

/** Cambios con un segmento nuevo; volver al valor del país lo quita (no es un cambio). */
export function conTarget(cambios: Cambios, secuencia: number, ideal: number, valor: number): Cambios {
  const k = String(secuencia)
  const resto = Object.fromEntries(Object.entries(cambios).filter(([c]) => c !== k))
  return valor === ideal ? resto : { ...resto, [k]: valor }
}

/** Reparte `total` en proporción a `pesos`, en enteros que suman exacto (mayor resto). Sin pesos,
 * reparte parejo. */
export function repartir(pesos: number[], total: number): number[] {
  if (pesos.length === 0) return []
  const suma = pesos.reduce((a, b) => a + b, 0)
  const base = suma > 0 ? pesos : pesos.map(() => 1)
  const s = suma > 0 ? suma : pesos.length
  const crudos = base.map((p) => (p * total) / s)
  const out = crudos.map(Math.floor)
  let falta = total - out.reduce((a, b) => a + b, 0)
  const orden = crudos.map((c, i) => [c - Math.floor(c), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1])
  for (const [, i] of orden) {
    if (falta <= 0) break
    out[i] += 1
    falta -= 1
  }
  return out
}

/** Total vigente de cada región en cada bloque: región → bloque → total. */
export function totales(estructura: Estructura, cambios: Cambios): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>()
  for (const b of estructura.bloques) {
    for (const r of b.regiones) {
      const t = r.celdas.reduce((a, c) => a + target(cambios, c.secuencia, c.ideal), 0)
      if (!out.has(r.id)) out.set(r.id, new Map())
      out.get(r.id)!.set(b.nombre, t)
    }
  }
  return out
}

export interface Descuadre {
  region: string
  nombre: string
  porBloque: { bloque: string; total: number }[]
}

/** Regiones que no suman lo mismo en todos los bloques: la API no las acepta. */
export function descuadres(estructura: Estructura, cambios: Cambios): Descuadre[] {
  const nombres = new Map<string, string>()
  for (const b of estructura.bloques) for (const r of b.regiones) if (!nombres.has(r.id)) nombres.set(r.id, r.nombre)
  const out: Descuadre[] = []
  for (const [region, porBloque] of totales(estructura, cambios)) {
    if (new Set(porBloque.values()).size > 1) {
      out.push({
        region,
        nombre: nombres.get(region)!,
        porBloque: [...porBloque].map(([bloque, total]) => ({ bloque, total })),
      })
    }
  }
  return out
}

/**
 * Lleva una región a `total` en todos los bloques, salvo los de `fijos`, repartiendo en
 * proporción a los targets vigentes de cada segmento.
 */
export function llevarRegion(
  estructura: Estructura,
  cambios: Cambios,
  region: string,
  total: number,
  fijos: string[] = [],
): Cambios {
  let out = cambios
  for (const b of estructura.bloques) {
    if (fijos.includes(b.nombre)) continue
    const r = b.regiones.find((x) => x.id === region)
    if (!r) continue
    const nuevos = repartir(r.celdas.map((c) => target(out, c.secuencia, c.ideal)), total)
    r.celdas.forEach((c, i) => {
      out = conTarget(out, c.secuencia, c.ideal, nuevos[i])
    })
  }
  return out
}

/** Cambios que pertenecen a un bloque (para el contador de cada pestaña). */
export function cambiosDelBloque(bloque: BloqueEstructura, cambios: Cambios): number {
  return bloque.regiones.reduce((n, r) => n + r.celdas.filter((c) => String(c.secuencia) in cambios).length, 0)
}

/**
 * Lo pegado desde Excel (filas con tabulaciones) como matriz de enteros. Acepta miles con punto o
 * coma («1.234») y celdas vacías (no cambian ese segmento). `null` si algo no es un entero ≥ 0.
 */
export function leerPegado(texto: string): (number | null)[][] | null {
  const filas = texto.replace(/\r/g, "").replace(/\n+$/, "").split("\n")
  const out: (number | null)[][] = []
  for (const f of filas) {
    const fila: (number | null)[] = []
    for (const celda of f.split("\t")) {
      const t = celda.trim().replace(/[.,\s](?=\d{3}(\D|$))/g, "")
      if (t === "") {
        fila.push(null)
        continue
      }
      if (!/^\d+$/.test(t)) return null
      fila.push(Number(t))
    }
    out.push(fila)
  }
  return out
}

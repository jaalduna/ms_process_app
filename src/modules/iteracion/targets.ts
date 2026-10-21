// Targets por segmento (Elegibilidad: ajuste `muestra_ideal`; Pesaje: ajuste `universo`): lo
// que se calcula al editar, separado de la vista para probarlo sin montar la tabla.
import type { BloqueEstructura, Estructura } from "./types"

export type Cambios = Record<string, number>
type Region = BloqueEstructura["regiones"][number]
type Celda = Region["celdas"][number]
type Unidad = { clave: string | null; actual: number; region: Region | null; celda: Celda | null }

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

const totalRegion = (r: Region, cambios: Cambios) => r.celdas.reduce((a, c) => a + target(cambios, c.secuencia, c.ideal), 0)
const cruzable = (id: string) => !id.startsWith("#")

export interface Subpoblacion {
  nombre: string
  porBloque: Map<string, number>
}

/**
 * Subpoblaciones que pueden aparecer en varios bloques, con su total en cada uno: cada región (y
 * cada prefijo de su ruta, «país» en «país › región») y cada celda con `clave`, que en otro bloque
 * puede ser una región (Pesaje: NORTE es hoja en «Split Regiones»).
 */
export function subpoblaciones(estructura: Estructura, cambios: Cambios): Map<string, Subpoblacion> {
  const out = new Map<string, Subpoblacion>()
  const sumar = (clave: string, nombre: string, bloque: string, t: number) => {
    if (!out.has(clave)) out.set(clave, { nombre, porBloque: new Map() })
    const p = out.get(clave)!.porBloque
    p.set(bloque, (p.get(bloque) ?? 0) + t)
  }
  for (const b of estructura.bloques) {
    for (const r of b.regiones) {
      if (cruzable(r.id)) {
        const ids = r.id.split(" › ")
        const nombres = r.nombre.split(" › ")
        const t = totalRegion(r, cambios)
        ids.forEach((_, k) => sumar(ids.slice(0, k + 1).join(" › "), nombres.slice(0, k + 1).join(" › "), b.nombre, t))
      }
      for (const c of r.celdas) if (c.clave) sumar(c.clave, c.categoria, b.nombre, target(cambios, c.secuencia, c.ideal))
    }
  }
  return out
}

/** Total vigente de cada bloque. */
export function totalesBloque(estructura: Estructura, cambios: Cambios): Map<string, number> {
  return new Map(estructura.bloques.map((b) => [b.nombre, b.regiones.reduce((a, r) => a + totalRegion(r, cambios), 0)]))
}

export interface Descuadre {
  region: string
  nombre: string
  porBloque: { bloque: string; total: number }[]
}

/** Subpoblaciones que no suman lo mismo en todos los bloques donde están: la API no las acepta. */
export function descuadres(estructura: Estructura, cambios: Cambios): Descuadre[] {
  const out: Descuadre[] = []
  for (const [region, s] of subpoblaciones(estructura, cambios)) {
    if (s.porBloque.size > 1 && new Set(s.porBloque.values()).size > 1) {
      out.push({ region, nombre: s.nombre, porBloque: [...s.porBloque].map(([bloque, total]) => ({ bloque, total })) })
    }
  }
  return out
}

/** Bloques con totales distintos (el país tiene que sumar lo mismo en todos), o null. */
export function descuadreTotal(estructura: Estructura, cambios: Cambios): { bloque: string; total: number }[] | null {
  const t = totalesBloque(estructura, cambios)
  return new Set(t.values()).size > 1 ? [...t].map(([bloque, total]) => ({ bloque, total })) : null
}

/**
 * Lleva una región a `total` en todos los bloques, salvo los de `fijos`: donde es región reparte
 * en proporción a sus segmentos; donde es una sola celda (misma clave), la fija.
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
    if (r) {
      const nuevos = repartir(r.celdas.map((c) => target(out, c.secuencia, c.ideal)), total)
      r.celdas.forEach((c, i) => {
        out = conTarget(out, c.secuencia, c.ideal, nuevos[i])
      })
      continue
    }
    const c = b.regiones.flatMap((x) => x.celdas).find((x) => x.clave === region)
    if (c) out = conTarget(out, c.secuencia, c.ideal, total)
  }
  return out
}

/**
 * Lleva los demás bloques al total de `desde`: en cada uno, las regiones (o celdas) que también
 * están en `desde` toman su total de ahí, así siguen cuadrando; la diferencia que queda se reparte
 * en proporción entre las demás.
 */
export function llevarTotal(estructura: Estructura, cambios: Cambios, desde: string): Cambios {
  const ref = estructura.bloques.find((b) => b.nombre === desde)!
  const tot = totalesBloque(estructura, cambios).get(desde)!
  const enRef = new Map<string, number>()
  for (const [k, s] of subpoblaciones(estructura, cambios)) {
    const v = s.porBloque.get(desde)
    if (v !== undefined) enRef.set(k, v)
  }
  let out = cambios
  for (const b of estructura.bloques) {
    if (b === ref) continue
    // unidades: regiones cruzables o, en las filas sin región, cada celda
    const unidades: Unidad[] = b.regiones.flatMap((r): Unidad[] =>
      cruzable(r.id)
        ? [{ clave: r.id, actual: totalRegion(r, out), region: r, celda: null }]
        : r.celdas.map((c) => ({ clave: c.clave ?? null, actual: target(out, c.secuencia, c.ideal), region: null, celda: c })),
    )
    const fijo = unidades.map((u) => (u.clave !== null ? enRef.get(u.clave) : undefined))
    const libres = unidades.map((_, i) => i).filter((i) => fijo[i] === undefined)
    const resto = tot - fijo.reduce<number>((a, v) => a + (v ?? 0), 0)
    // sin unidades libres, lo fijado tiene que calzar solo; si no, ese bloque se arregla a mano
    if (resto < 0 || (!libres.length && resto !== 0)) continue
    const nuevos = repartir(libres.map((i) => unidades[i].actual), resto)
    const meta = unidades.map((_, i) => fijo[i] ?? nuevos[libres.indexOf(i)])
    unidades.forEach((u, i) => {
      if (u.celda) out = conTarget(out, u.celda.secuencia, u.celda.ideal, meta[i])
      else {
        const r = u.region!
        const v = repartir(r.celdas.map((c) => target(out, c.secuencia, c.ideal)), meta[i])
        r.celdas.forEach((c, j) => {
          out = conTarget(out, c.secuencia, c.ideal, v[j])
        })
      }
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

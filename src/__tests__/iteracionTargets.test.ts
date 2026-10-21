import { describe, expect, it } from "vitest"
import {
  conTarget,
  descuadres,
  descuadreTotal,
  leerPegado,
  llevarRegion,
  llevarTotal,
  repartir,
  subpoblaciones,
} from "@/modules/iteracion/targets"
import type { Estructura } from "@/modules/iteracion/types"

// dos bloques × dos regiones; NORTE suma 30 y SUR 50 en los dos
const EST: Estructura = {
  bloques: [
    {
      secuencia: 0, nombre: "NSE", variable: "NSE_LOC", total: 80, categorias: ["AB", "C"],
      regiones: [
        { secuencia: 1, id: "16", nombre: "NORTE", total: 30, celdas: [
          { secuencia: 2, categoria: "AB", ideal: 10 }, { secuencia: 3, categoria: "C", ideal: 20 }] },
        { secuencia: 4, id: "4", nombre: "SUR", total: 50, celdas: [
          { secuencia: 5, categoria: "AB", ideal: 15 }, { secuencia: 6, categoria: "C", ideal: 35 }] },
      ],
    },
    {
      secuencia: 7, nombre: "EDAC", variable: "EDAC", total: 80, categorias: ["-39", "40+"],
      regiones: [
        // otro bloque puede escribir distinto el nombre: se cruza por id
        { secuencia: 8, id: "16", nombre: "Norte", total: 30, celdas: [
          { secuencia: 9, categoria: "-39", ideal: 12 }, { secuencia: 10, categoria: "40+", ideal: 18 }] },
        { secuencia: 11, id: "4", nombre: "SUR", total: 50, celdas: [
          { secuencia: 12, categoria: "-39", ideal: 20 }, { secuencia: 13, categoria: "40+", ideal: 30 }] },
      ],
    },
  ],
}

describe("targets por segmento", () => {
  it("volver al valor del país no queda como cambio", () => {
    const c = conTarget({}, 2, 10, 14)
    expect(c).toEqual({ "2": 14 })
    expect(conTarget(c, 2, 10, 10)).toEqual({})
  })

  it("reparte en enteros que suman exacto, en proporción", () => {
    expect(repartir([10, 20], 40)).toEqual([13, 27])
    expect(repartir([1, 1, 1], 10)).toEqual([4, 3, 3])
    expect(repartir([0, 0], 5)).toEqual([3, 2])
    expect(repartir([12, 18], 40).reduce((a, b) => a + b)).toBe(40)
  })

  it("un segmento cambiado descuadra su región contra los otros bloques", () => {
    const c = conTarget({}, 2, 10, 20)
    expect(subpoblaciones(EST, c).get("16")!.porBloque).toEqual(new Map([["NSE", 40], ["EDAC", 30]]))
    expect(descuadreTotal(EST, c)).toEqual([{ bloque: "NSE", total: 90 }, { bloque: "EDAC", total: 80 }])
    expect(descuadres(EST, c)).toEqual([
      { region: "16", nombre: "NORTE", porBloque: [{ bloque: "NSE", total: 40 }, { bloque: "EDAC", total: 30 }] },
    ])
  })

  it("igualar lleva los otros bloques al total del editado, en proporción", () => {
    const c = llevarRegion(EST, conTarget({}, 2, 10, 20), "16", 40, ["NSE"])
    expect(c).toEqual({ "2": 20, "9": 16, "10": 24 })
    expect(descuadres(EST, c)).toEqual([])
  })

  it("cambiar el total de la región reparte en todos los bloques", () => {
    const c = llevarRegion(EST, {}, "4", 60)
    expect(c).toEqual({ "5": 18, "6": 42, "12": 24, "13": 36 })
    expect(descuadres(EST, c)).toEqual([])
  })

  it("lee lo pegado desde Excel: tabulaciones, miles y celdas vacías", () => {
    expect(leerPegado("10\t1.234\r\n\t7\n")).toEqual([[10, 1234], [null, 7]])
    expect(leerPegado("10\tabc")).toBeNull()
    expect(leerPegado("-3")).toBeNull()
  })

  it("Pesaje: país › región se cruza también por el prefijo y la hoja con clave cuenta como región", () => {
    const uni: Estructura = {
      bloques: [
        { secuencia: 0, nombre: "NSE", variable: "N", total: 100, categorias: ["AB", "C"], regiones: [
          { secuencia: 1, id: "[P]=1 › [R]=1", nombre: "Guate › Ciudad", total: 60, celdas: [
            { secuencia: 2, categoria: "AB", ideal: 20, clave: "[P]=1 › [R]=1 › [N]=1" },
            { secuencia: 3, categoria: "C", ideal: 40, clave: "[P]=1 › [R]=1 › [N]=2" }] },
          { secuencia: 4, id: "[P]=2 › [R]=2", nombre: "Hond › Toda", total: 40, celdas: [
            { secuencia: 5, categoria: "AB", ideal: 10, clave: "[P]=2 › [R]=2 › [N]=1" },
            { secuencia: 6, categoria: "C", ideal: 30, clave: "[P]=2 › [R]=2 › [N]=2" }] }] },
        { secuencia: 7, nombre: "País", variable: "P", total: 100, categorias: ["Guate", "Hond"], regiones: [
          { secuencia: 7, id: "#7", nombre: "Total", total: 100, celdas: [
            { secuencia: 8, categoria: "Guate", ideal: 60, clave: "[P]=1" },
            { secuencia: 9, categoria: "Hond", ideal: 40, clave: "[P]=2" }] }] },
      ],
    }
    const c = conTarget({}, 2, 20, 30)
    expect(descuadres(uni, c).map((d) => d.nombre)).toEqual(["Guate"])
    // llevar el resto al total de NSE: Guate toma 70 de NSE y Hond queda con lo suyo
    const l = llevarTotal(uni, c, "NSE")
    expect(l).toEqual({ "2": 30, "8": 70 })
    expect(descuadres(uni, l)).toEqual([])
    expect(descuadreTotal(uni, l)).toBeNull()
  })
})

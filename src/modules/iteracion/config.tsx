import type { ComponentType } from "react"
import { ResultadoElegibilidadView } from "./components/ResultadoElegibilidad"
import { ResultadoPesajeView } from "./components/ResultadoPesaje"
import type { ItemConfigPais } from "./components/ConfigPais"
import { SelectorIdPesos } from "./components/SelectorIdPesos"
import { TargetsSegmento, type Logro } from "./components/TargetsSegmento"
import { num } from "./format"
import { CONFIG_PAIS_ELEGIBILIDAD, CONFIG_PAIS_PESAJE } from "./configPaisItems"
import { IDPESOS } from "./idpesos"
import { descuadres, descuadreTotal, type Cambios } from "./targets"
import type {
  Ajustes,
  Engine,
  IdPesoDisponible,
  AjustesElegibilidad,
  AjustesPesaje,
  Proceso,
  ResultadoElegibilidad,
  Parametros,
  ResultadoPesaje,
  Simulacion,
} from "./types"

export interface PropsAjustes {
  ajustes: Ajustes
  onAjustes: (a: Ajustes) => void
  /** Pesaje: IdPesos del país que entrega la API (si no viene, la lista de referencia). */
  idpesos?: IdPesoDisponible[] | null
  engine?: Engine
}

/** Lo que cambia entre Elegibilidad y Pesaje; el resto del flujo es común. */
export interface ConfigProceso {
  proceso: Proceso
  titulo: string
  descripcion: string
  ajustesIniciales: Ajustes
  Resultado: ComponentType<PropsAjustes & { resultado: Simulacion["resultado"] }>
  /** Ajustes que van en la columna de parámetros (p. ej. qué IdPesos calcular). */
  AjustesLaterales?: ComponentType<PropsAjustes>
  describirAjustes: (a: Ajustes, idpesos?: IdPesoDisponible[] | null) => string
  /** Pesaje elige si publica directo en SQL o genera el Excel para Kronos. */
  eligeDestino: boolean
  /** Ajustes que se editan sobre los datos del país (Elegibilidad: targets por segmento). */
  EditorDatos?: ComponentType<PropsAjustes & { parametros: Parametros; resultado?: Simulacion["resultado"] }>
  /** Por qué no se puede calcular con estos ajustes (null = se puede). */
  bloqueoCalcular?: (a: Ajustes, parametros: Parametros) => string | null
  /** Configuración permanente del país, bajo los parámetros (la API dice qué versión usa). */
  configPais: ItemConfigPais[]
}

export const ELEGIBILIDAD: ConfigProceso = {
  proceso: "elegibilidad",
  titulo: "Elegibilidad",
  descripcion: "Prepara el cierre, itera la imputación por región y publica con aprobación.",
  ajustesIniciales: { regiones_cerradas: [], muestra_ideal: {} } satisfies AjustesElegibilidad,
  Resultado: ({ resultado, ajustes, onAjustes }) => (
    <ResultadoElegibilidadView
      resultado={resultado as ResultadoElegibilidad}
      ajustes={ajustes as AjustesElegibilidad}
      onAjustes={onAjustes}
    />
  ),
  describirAjustes: (a) => {
    const e = a as AjustesElegibilidad
    const cerradas = e.regiones_cerradas.length ? `Sin imputar: ${e.regiones_cerradas.join(", ")}` : "Todas las regiones"
    const n = Object.keys(e.muestra_ideal ?? {}).length
    return n ? `${cerradas} · ${n === 1 ? "1 target cambiado" : `${n} targets cambiados`}` : cerradas
  },
  eligeDestino: false,
  configPais: CONFIG_PAIS_ELEGIBILIDAD,
  EditorDatos: ({ parametros, ajustes, onAjustes, resultado }) => {
    if (!parametros.estructura) return null
    const a = ajustes as AjustesElegibilidad
    const celdas = (resultado as ResultadoElegibilidad | undefined)?.celdas ?? []
    const logro = new Map<string, Logro>(
      celdas.map((c) => [c.secuencia, {
        valor: c.natural + c.imputados,
        detalle: `Último cálculo: ${num(c.natural)} naturales + ${num(c.imputados)} imputados = ${num(c.natural + c.imputados)}`,
      }]),
    )
    return (
      <TargetsSegmento
        titulo="Targets por segmento"
        detalle="Muestra ideal de cada celda, de la Estructura del país. Lo que cambies vale para esta vuelta y queda guardado en el escenario."
        estructura={parametros.estructura}
        cambios={a.muestra_ideal ?? {}}
        onCambios={(c) => onAjustes({ ...a, muestra_ideal: c })}
        logro={logro}
      />
    )
  },
  bloqueoCalcular: (a, parametros) => bloqueo(parametros, (a as AjustesElegibilidad).muestra_ideal ?? {}),
}

/** Por qué los targets editados no se pueden calcular todavía (la API los rechazaría). */
function bloqueo(parametros: Parametros, cambios: Cambios): string | null {
  if (!parametros.estructura) return null
  if (descuadreTotal(parametros.estructura, cambios)) return "los bloques no suman el mismo total del país"
  const malos = descuadres(parametros.estructura, cambios)
  if (!malos.length) return null
  const nombres = malos.slice(0, 3).map((m) => m.nombre).join(", ") + (malos.length > 3 ? ` y ${malos.length - 3} más` : "")
  return `${nombres} no ${malos.length === 1 ? "suma" : "suman"} lo mismo en todos los bloques`
}

export const PESAJE: ConfigProceso = {
  proceso: "pesaje",
  titulo: "Pesaje",
  descripcion: "Prepara el cierre, itera el IPF por IdPeso y publica los pesos con aprobación.",
  ajustesIniciales: { idpesos: ["1", "3", "7"], juntas_vetadas: [], universo: {} } satisfies AjustesPesaje,
  Resultado: ({ resultado, ajustes, onAjustes, engine }) => (
    <ResultadoPesajeView
      resultado={resultado as ResultadoPesaje}
      ajustes={ajustes as AjustesPesaje}
      onAjustes={onAjustes}
      puedeVetar={engine !== "real"}
    />
  ),
  AjustesLaterales: SelectorIdPesos,
  describirAjustes: (a, idpesos) => {
    const p = a as AjustesPesaje
    const nombres = (idpesos ?? IDPESOS).filter((i) => p.idpesos.includes(i.id)).map((i) => i.nombre)
    const vetadas = p.juntas_vetadas.length ? ` · ${p.juntas_vetadas.length} juntas vetadas` : ""
    const n = Object.keys(p.universo ?? {}).length
    const universo = n ? ` · ${n === 1 ? "1 celda del universo cambiada" : `${n} celdas del universo cambiadas`}` : ""
    return `${nombres.join(", ")}${vetadas}${universo}`
  },
  eligeDestino: true,
  configPais: CONFIG_PAIS_PESAJE,
  EditorDatos: ({ parametros, ajustes, onAjustes, resultado }) => {
    if (!parametros.estructura) return null
    const a = ajustes as AjustesPesaje
    // el peso total que logró cada celda en el primer IdPeso calculado
    const seg = (resultado as ResultadoPesaje | undefined)?.segmentos?.[0]
    const logro = new Map<string, Logro>(
      (seg?.grupos ?? []).flatMap((g) => g.celdas).map((c) => [String(c.uig), {
        valor: Math.round(c.peso_total),
        detalle: `Último cálculo (IdPeso ${seg!.idpeso}): peso total ${num(Math.round(c.peso_total))} contra universo ${num(c.universo)}`,
      }]),
    )
    return (
      <TargetsSegmento
        titulo="Universo por segmento"
        detalle={`Universo del período (columna ${parametros.estructura.columna}) de cada celda, del Universo del país. Lo que cambies vale para esta vuelta y queda guardado en el escenario.`}
        estructura={parametros.estructura}
        cambios={a.universo ?? {}}
        onCambios={(c) => onAjustes({ ...a, universo: c })}
        logro={logro}
        tolerancia={0.001}
      />
    )
  },
  bloqueoCalcular: (a, parametros) => bloqueo(parametros, (a as AjustesPesaje).universo ?? {}),
}

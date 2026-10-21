import type { ComponentType } from "react"
import { ResultadoElegibilidadView } from "./components/ResultadoElegibilidad"
import { ResultadoPesajeView } from "./components/ResultadoPesaje"
import { SelectorIdPesos } from "./components/SelectorIdPesos"
import { TargetsSegmento } from "./components/TargetsSegmento"
import { IDPESOS } from "./idpesos"
import { descuadres } from "./targets"
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
  EditorDatos: ({ parametros, ajustes, onAjustes, resultado }) =>
    parametros.estructura ? (
      <TargetsSegmento
        estructura={parametros.estructura}
        ajustes={ajustes as AjustesElegibilidad}
        onAjustes={onAjustes}
        celdas={(resultado as ResultadoElegibilidad | undefined)?.celdas}
      />
    ) : null,
  bloqueoCalcular: (a, parametros) => {
    if (!parametros.estructura) return null
    const malos = descuadres(parametros.estructura, (a as AjustesElegibilidad).muestra_ideal ?? {})
    if (!malos.length) return null
    return `${malos.map((m) => m.nombre).join(", ")} no ${malos.length === 1 ? "suma" : "suman"} lo mismo en todos los bloques de targets`
  },
}

export const PESAJE: ConfigProceso = {
  proceso: "pesaje",
  titulo: "Pesaje",
  descripcion: "Prepara el cierre, itera el IPF por IdPeso y publica los pesos con aprobación.",
  ajustesIniciales: { idpesos: ["1", "3", "7"], juntas_vetadas: [] } satisfies AjustesPesaje,
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
    return `${nombres.join(", ")}${vetadas}`
  },
  eligeDestino: true,
}

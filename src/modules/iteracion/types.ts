// Contrato de /iteracion (specs/SPEC-iteracion.md): preparar una vez, iterar sobre el silver,
// comparar escenarios y publicar con aprobación. Mismo contrato para Elegibilidad y Pesaje;
// lo que cambia por proceso son los parámetros, los ajustes y la forma de `resultado`.

export type Proceso = "elegibilidad" | "pesaje"

/**
 * `simulated`: resultados ilustrativos, no lee ni escribe SQL. `real`: el proceso de producción
 * sobre datos de SQL (hoy solo Pesaje; todavía no escribe en SQL).
 */
export type Engine = "simulated" | "real"

export type Nivel = "ok" | "aviso" | "error"

export interface PaisIteracion {
  id: string
  label: string
  panel: "hogares" | "ooh"
}

export interface Preparacion {
  proceso: Proceso
  pais: string
  periodo: string
  engine: Engine
  estado: "sin_preparar" | "preparando" | "lista" | "error"
  /** Motivo cuando `estado` es `error`. */
  error?: string | null
  preparado_en: string | null
  version_silver: string | null
  fuente: string
  tablas: { nombre: string; filas: number | null; estado: "lista" | "pendiente" | "error" }[]
  validaciones: { id: string; titulo: string; detalle: string; nivel: Nivel }[]
  dependencias: { proceso: Proceso; estado: "publicada" | "pendiente"; detalle: string }[]
  /** Motor real: avance de una preparación en curso. */
  progreso?: {
    segundos: number
    pasos: { id: string; titulo: string; estado: "pendiente" | "en_curso" | "listo"; filas: number | null; segundos: number | null }[]
  } | null
}

export interface ParamDef {
  clave: string
  etiqueta: string
  ayuda: string
  tipo: "rango" | "entero" | "booleano"
  min?: number
  max?: number
  paso?: number
  formato?: "pct" | "num" | "percentil" | "err"
}

export type ValoresParametros = Record<string, number | boolean>

export interface IdPesoDisponible {
  id: string
  nombre: string
}

export interface Parametros {
  definiciones: ParamDef[]
  valores: ValoresParametros
  referencia: { etiqueta: string; valores: ValoresParametros }
  /** Ajustes del escenario de referencia (dependen del motor). */
  ajustes?: Ajustes
  /** Pesaje: IdPesos que se pueden calcular para el país. */
  idpesos?: IdPesoDisponible[] | null
}

export interface AjustesElegibilidad {
  regiones_cerradas: string[]
}

export interface AjustesPesaje {
  idpesos: string[]
  juntas_vetadas: string[]
}

export type Ajustes = AjustesElegibilidad | AjustesPesaje

export interface Kpi {
  id: string
  etiqueta: string
  valor: number
  formato: "num" | "pct" | "err" | "seg"
  nota?: string | null
  estado?: Nivel | "neutro"
}

export interface RegionElegibilidad {
  id: string
  nombre: string
  ideal: number
  natural: number
  imputados: number
  final: number
  cumplimiento: number
  estado: "ok" | "justo" | "deficit" | "cerrada"
  /** Motor real: hogares reemplazados y elegibles publicados de la región. */
  reemplazos?: number
  publicado?: number | null
}

export interface ResultadoElegibilidad {
  tipo: "elegibilidad"
  f_ok: number
  regiones: RegionElegibilidad[]
  revision: { hogares_imputar: number; regiones_con_imputacion: number; actos_imputar?: number }
  /** Motor real: el país publica solo la marca de elegibilidad (Argentina). */
  parcial?: boolean
  tendencia: { periodo: string; pct_imputado: number; actual: boolean }[]
  comparaciones: { etiqueta: string; delta_pp: number }[]
  donantes: { usos: number; hogares: number }[]
}

export interface ResultadoPesaje {
  tipo: "pesaje"
  unidad: "hogar" | "individuo"
  meta_error: number
  idpesos: {
    id: string
    nombre: string
    pesados: number
    error_inicial: number
    error_final: number
    outliers: number
    juntas: number
    diferencia_actual: number
    /** Motor real: diferencia relativa por hogar contra el peso publicado. */
    dif_mediana?: number | null
    dif_p90?: number | null
    dif_sobre_5?: number | null
  }[]
  histograma: { periodo_anterior: string; anterior: number[]; actual: number[]; fuera: boolean[]; bordes?: number[] }
  juntas: { id: string; region: string; detalle: string; vetada: boolean; motivo?: string }[]
  /** Motor real: indicadores del mes contra los 12 meses anteriores publicados, por IdPeso. */
  revision?: { idpeso: string; indicadores: IndicadorRevision[] }[]
  /** Motor real: celdas del Universo agrupadas como en el Excel, por IdPeso. */
  segmentos?: { idpeso: string; grupos: GrupoCeldas[] }[]
}

export interface IndicadorRevision {
  id: string
  etiqueta: string
  formato: "num" | "pct1" | "x" | "err"
  valor: number
  mes_anterior: number | null
  min12?: number
  max12?: number
  media12?: number
  serie: { periodo: string; valor: number | null }[]
  estado: Nivel | "neutro"
  regla: string
}

export interface CeldaUniverso {
  uig: number
  nivel: number
  categoria: string
  padre: string | null
  hogares: number
  hogares_12m: number
  universo: number
  peso_total: number
  dif_universo: number
  peso_medio: number
  peso_medio_12m: number
  limite_inf: number
  limite_sup: number
  peso_min: number
  peso_max: number
  peso_medio_publicado: number | null
  junta: { con: string; lado: "sale" | "recibe"; motivo: string; excepcion: boolean } | null
  estado: "ok" | "aviso" | "error"
  motivos: string[]
}

export interface GrupoCeldas {
  id: string
  nombre: string
  celdas: CeldaUniverso[]
}

export interface Simulacion {
  engine: Engine
  duracion_ms: number
  generado_en: string
  kpis: Kpi[]
  resultado: ResultadoElegibilidad | ResultadoPesaje
}

export interface Escenario {
  id: string
  nombre: string
  es_referencia: boolean
  creado_por: string
  creado_en: string
  parametros: ValoresParametros
  ajustes: Ajustes
  resumen: Kpi[]
}

export interface Escenarios {
  escenarios: Escenario[]
  elegido_id: string | null
  /** Motor real: el escenario de referencia todavía se está calculando. */
  calculando?: boolean
}

export interface Publicacion {
  estado: "borrador" | "pendiente" | "publicada"
  engine: Engine
  escenario_id: string | null
  destino: "sql" | "kronos" | null
  plan: { paso: number; tabla: string; cambio: string }[]
  chequeos: { texto: string; nivel: Nivel | "pendiente" }[]
  enviado_por: string | null
  aprobado_por: string | null
  puede_enviar: boolean
  puede_aprobar: boolean
  bitacora: { en: string; usuario: string; texto: string }[]
}

// ── Conversaciones (preguntas, comentarios y problemas anclados a una sección) ──────────────────
export type TipoHilo = "pregunta" | "comentario" | "problema"
export type EstadoHilo = "abierta" | "resuelta"
/** paso.sección: dónde vive el hilo en la pantalla. */
export type Ancla =
  | "preparar.tablas"
  | "preparar.validaciones"
  | "iterar.parametros"
  | "iterar.regiones"
  | "iterar.idpeso"
  | "iterar.revision"
  | "iterar.celdas"
  | "iterar.juntas"
  | "comparar.escenarios"
  | "publicar.plan"

export interface Autor {
  email: string
  nombre: string
}

export interface MensajeHilo {
  id: string
  texto: string
  creado: string
  autor: Autor
}

export interface Hilo {
  id: string
  proceso: Proceso
  ancla: Ancla
  pais: string | null
  tipo: TipoHilo
  titulo: string
  texto: string
  propuesta: string | null
  estado: EstadoHilo
  autor: Autor
  creado: string
  actualizado: string
  mensajes: MensajeHilo[]
}

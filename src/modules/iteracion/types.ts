// Contrato de /iteracion (specs/SPEC-iteracion.md): preparar una vez, iterar sobre el silver,
// comparar escenarios y publicar con aprobación. Mismo contrato para Elegibilidad y Pesaje;
// lo que cambia por proceso son los parámetros, los ajustes y la forma de `resultado`.

export type Proceso = "elegibilidad" | "pesaje"

/** `simulated`: resultados ilustrativos, no lee ni escribe SQL. `databricks`: motor real. */
export type Engine = "simulated" | "databricks"

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
  preparado_en: string | null
  version_silver: string | null
  fuente: string
  tablas: { nombre: string; filas: number | null; estado: "lista" | "pendiente" | "error" }[]
  validaciones: { id: string; titulo: string; detalle: string; nivel: Nivel }[]
  dependencias: { proceso: Proceso; estado: "publicada" | "pendiente"; detalle: string }[]
}

export interface ParamDef {
  clave: string
  etiqueta: string
  ayuda: string
  tipo: "rango" | "entero" | "booleano"
  min?: number
  max?: number
  paso?: number
  formato?: "pct" | "num" | "percentil"
}

export type ValoresParametros = Record<string, number | boolean>

export interface Parametros {
  definiciones: ParamDef[]
  valores: ValoresParametros
  referencia: { etiqueta: string; valores: ValoresParametros }
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
  nota?: string
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
}

export interface ResultadoElegibilidad {
  tipo: "elegibilidad"
  f_ok: number
  regiones: RegionElegibilidad[]
  revision: { hogares_imputar: number; regiones_con_imputacion: number }
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
  }[]
  histograma: { periodo_anterior: string; anterior: number[]; actual: number[]; fuera: boolean[] }
  juntas: { id: string; region: string; detalle: string; vetada: boolean }[]
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

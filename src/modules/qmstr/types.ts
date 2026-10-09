/**
 * QMS-TR (JAA-1401): contrato con ms-process-api `routes/qms_tr.py` (JAA-1400).
 *
 * El usuario elige país + instante; la API resuelve el snapshot de J siguiente a ese instante y
 * dispara el job `qms_tr_run` (repo mtr) con las versiones fijadas. Si el snapshot todavía no existe
 * la corrida queda en `waiting_snapshot` y parte sola cuando el CDC horario lo produce.
 */

export type QmsTrStatus = "waiting_snapshot" | "pending" | "running" | "completed" | "failed" | "cancelled"

export interface QmsTrStep {
  name: string
  status: string
  started_at: string | null
  completed_at: string | null
  error: string | null
}

export interface QmsTrSnapshotTabla {
  table: string
  table_fqn: string
  version: number
  timestamp: string
}

export interface QmsTrSnapshot {
  status: "ready" | "waiting"
  at: string
  j: QmsTrSnapshotTabla | null
  tables: QmsTrSnapshotTabla[]
  expected_j_at: string | null
  warnings: string[]
}

export type QmsTrResultado = "aplicado" | "pendiente" | "distinto"

export interface QmsTrValidacionFila {
  sheet: string
  id_ato: number
  id_produto: number | null
  variable: string | null
  esperado: number | string | null
  actual: number | string | null
  anterior: number | string | null
  resultado: QmsTrResultado
}

export interface QmsTrValidacionHoja {
  total: number
  checked: number
  applied: number
  pending: number
  mismatched: number
}

export interface QmsTrValidacion {
  status: "aplicado" | "parcial" | "no_aplicado"
  validated_at: string
  validated_by: string | null
  checked: number
  applied: number
  pending: number
  mismatched: number
  by_sheet: Record<string, QmsTrValidacionHoja>
  rows: QmsTrValidacionFila[]
}

export interface QmsTrRun {
  run_id: string
  country: string
  at: string
  mes_procesamiento: string
  productos: number[]
  status: QmsTrStatus
  current_step: string | null
  steps: QmsTrStep[]
  snapshot: QmsTrSnapshot | null
  run_tag: string | null
  databricks_run_id: string | null
  run_page_url: string | null
  started_at: string | null
  completed_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  error_message: string | null
  validacion: QmsTrValidacion | null
}

export interface QmsTrRunCreate {
  country: string
  /** ISO 8601 con zona horaria */
  at: string
  /** AAAAMM */
  mes_procesamiento: string
  productos?: number[]
}

export const ACTIVE_STATUSES: QmsTrStatus[] = ["waiting_snapshot", "pending", "running"]

/** Nombres de los pasos del job qms_tr_run (task_keys). Desconocidos se muestran tal cual. */
export const STEP_LABELS: Record<string, string> = {
  silver_builder: "Silver",
  panelistas: "Panelistas",
  prep: "Preparación",
  motor_grandes: "Motor (productos grandes)",
  motor_normales: "Motor",
  entrega: "Entregable",
}

export function qmsTrStepLabel(name: string): string {
  return STEP_LABELS[name] ?? name
}

/** Hojas del entregable de Data Quality, en el orden del xlsx (slug de la API -> etiqueta). */
export const SHEET_LABELS: Record<string, string> = {
  imputaciones: "Imputaciones",
  cantidad_envasados: "Cantidad envasados",
  factores: "Factores",
  exclusiones: "Exclusiones",
}

/** Países con motor QMS-TR (claves de ADAPTERS en el repo mtr). */
export const QMSTR_COUNTRIES = ["bolivia", "brasil", "cam", "chile", "colombia", "ecuador", "mexico", "peru"]

/** Etiqueta y color del estado de una corrida. */
export const STATUS_META: Record<string, { label: string; className: string }> = {
  waiting_snapshot: { label: "Esperando snapshot", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  pending: { label: "En cola", className: "bg-muted text-muted-foreground" },
  running: { label: "Ejecutando", className: "bg-primary/15 text-primary" },
  completed: { label: "Completado", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  failed: { label: "Error", className: "bg-destructive/15 text-destructive" },
  cancelled: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
}


// ---------------------------------------------------------------------------
// Flujo automático de QMS-TR v1.1 (JAA-1435): contrato de `/qmstr_flujo` (docs/SPEC_flujo_qmstr_v1.1.md §2).
// ---------------------------------------------------------------------------

export type FlujoModo = "simulacion" | "real"

/** GET /qmstr_flujo/estado */
export interface FlujoEstado {
  enabled: boolean
  modo: FlujoModo
  /** Códigos de país configurados (QMSTR_FLUJO_PAISES). */
  paises: string[]
  intervalo_segundos: number
  ultima_vuelta: string | null
  /** Resultado de la última vuelta por país ("ok" o el error). */
  resultado: Record<string, string> | null
  error_config: string | null
  /** La tarea de fondo del flujo está corriendo (la API real; el mock no lo informa). */
  activo?: boolean
}

/** GET /qmstr_flujo/paises */
export interface FlujoPais {
  codigo: string
  nombre: string
  etiqueta: string
}

/** GET /qmstr_flujo/periodos?pais= (últimos 6, más reciente primero). */
export interface FlujoPeriodo {
  periodo: string
  h3: number
  h4: number
  h10: number
  tandas: number
}

export type EstadoBase =
  | "sin_hito4"
  | "retenida"
  | "pendiente"
  | "en_proceso"
  | "aplicada"
  | "revertida"
  | "bypass"
  | "fuera_de_alcance"

export type TipoTanda = "liberacion" | "manual" | "reversion"
export type ModoTanda = "completo" | "solo_correr"
export type EstadoTanda =
  | "detectada"
  | "corriendo"
  | "armando_reversion"
  | "enviando"
  | "en_dq"
  | "verificando"
  | "hito10"
  | "cerrada"
  | "revision_manual"
  | "sin_bases"

export interface FlujoBaseEvento {
  at: string
  tanda_id: string
  tipo: TipoTanda
  evento: string
}

/** GET /qmstr_flujo/bases?pais=&periodo= — una fila por base (producto) del período. */
export interface FlujoBase {
  producto: number
  nombre: string
  h3: string | null
  h4: string | null
  h4_anulado: boolean
  h10: string | null
  fuera_de_alcance: boolean
  estado: EstadoBase
  tanda_id: string | null
  tanda_numero: number | null
  tanda_estado: EstadoTanda | null
  jira_key: string | null
  historial: FlujoBaseEvento[]
}

export interface TandaEvento {
  at: string
  estado: EstadoTanda
  detalle: string | null
}

export interface TandaValidacion {
  status?: "aplicado" | "parcial" | "no_aplicado"
  checked?: number
  applied?: number
  pending?: number
  mismatched?: number
  validated_at?: string
  validated_by?: string | null
  by_sheet?: Record<string, { total: number; checked: number; applied: number; pending: number; mismatched: number }>
}

/** Tanda = (país, período, número); todas las columnas de `qmstr_flujo_tandas`. */
export interface Tanda {
  id: string
  pais: string
  periodo: string
  numero: number
  categorias: number[]
  productos: number[]
  h4_desde: string
  h4_hasta: string
  estado: EstadoTanda
  estado_previo: EstadoTanda | null
  pausada: boolean
  qms_run_id: string | null
  jira_key: string | null
  envio: Record<string, unknown>
  bypass: number[]
  validacion: TandaValidacion
  error: string | null
  eventos: TandaEvento[]
  created_at: string
  updated_at: string
  tipo: TipoTanda
  modo: ModoTanda
  creada_por: string | null
  tanda_origen: string | null
  /** Nota del lanzamiento manual o motivo de la reversión. */
  nota: string | null
  /** Modo del flujo con que se creó: sólo avanza (y se revierte) en ese mismo modo. */
  ejecucion: FlujoModo
  correos: TandaCorreos
}

/**
 * Progreso de los correos de la tanda, en llaves planas como `envio`: `<tipo>` = id del borrador,
 * `<tipo>_hilo` = message_id al que responde (o null si salió como correo nuevo) y
 * `<tipo>_enviado` = el paso de envío terminó (en simulación sólo queda en la bandeja).
 */
export interface TandaCorreos {
  resultados?: string
  resultados_hilo?: string | null
  resultados_enviado?: boolean
  pase_mtr?: string
  pase_mtr_hilo?: string | null
  pase_mtr_enviado?: boolean
}

export interface TandaCreate {
  pais: string
  periodo: string
  productos: number[]
  modo: ModoTanda
  forzar: boolean
  nota: string
}

export interface TandaRevertir {
  productos: number[]
  motivo: string
}

export interface ProgresoForEach {
  total: number
  completadas: number
  fallidas: number
  activas: number
}

export interface ProgresoTarea {
  clave: string
  estado: string
  inicio: string | null
  fin: string | null
  for_each?: ProgresoForEach
}

/** GET /qmstr_flujo/tandas/{tid}/progreso — run del job qms_tr_run en Databricks. */
export interface TandaProgreso {
  /** Entero en Databricks; un uuid con la API en modo fake; null mientras espera el snapshot de J. */
  run_id: number | string | null
  /** Estado de Databricks (RUNNING, SUCCESS, ...) o WAITING_SNAPSHOT antes de lanzar el run. */
  estado: string
  run_page_url: string | null
  inicio: string | null
  fin: string | null
  productos_total: number
  productos_listos: number
  porcentaje: number
  tareas: ProgresoTarea[]
}

export type TipoCorreo = "resultados" | "pase_mtr"

/** GET /qmstr_flujo/correos — bandeja (simulada o enviada). */
export interface FlujoCorreo {
  id: string
  tanda_id: string
  pais: string
  periodo: string
  tipo: TipoCorreo
  /** message_id del correo al que responde (pase a MTR en el hilo de la liberación); null si es nuevo. */
  en_respuesta_a: string | null
  para: string[]
  cc: string[]
  asunto: string
  html: string
  adjuntos: string[]
  enviado: boolean
  modo: FlujoModo
  at: string
}

/** Estados en que la tanda sigue avanzando sola (ACTIVOS de la API + armando_reversion). */
export const TANDA_ACTIVOS: EstadoTanda[] = [
  "detectada", "corriendo", "armando_reversion", "enviando", "en_dq", "verificando", "hito10",
]

/** Camino feliz de cada tipo de tanda, en orden (lo que dibuja el stepper). */
export const CAMINO_TANDA: Record<"corrida" | "reversion" | "solo_correr", EstadoTanda[]> = {
  corrida: ["detectada", "corriendo", "enviando", "en_dq", "verificando", "hito10", "cerrada"],
  reversion: ["detectada", "armando_reversion", "enviando", "en_dq", "verificando", "hito10", "cerrada"],
  solo_correr: ["detectada", "corriendo", "cerrada"],
}

export function caminoDe(t: Pick<Tanda, "tipo" | "modo">): EstadoTanda[] {
  if (t.tipo === "reversion") return CAMINO_TANDA.reversion
  return t.modo === "solo_correr" ? CAMINO_TANDA.solo_correr : CAMINO_TANDA.corrida
}

export const ESTADO_TANDA_LABEL: Record<EstadoTanda, string> = {
  detectada: "Detectada",
  corriendo: "Corriendo",
  armando_reversion: "Armando reversión",
  enviando: "Enviando",
  en_dq: "En DQ",
  verificando: "Verificando en J",
  hito10: "Hito 10",
  cerrada: "Cerrada",
  revision_manual: "Revisión manual",
  sin_bases: "Sin bases",
}

export const TIPO_TANDA_LABEL: Record<TipoTanda, string> = {
  liberacion: "Liberación",
  manual: "Manual",
  reversion: "Reversión",
}

/** Orden y etiqueta de los estados de base (leyenda del tablero). */
export const ESTADOS_BASE: { estado: EstadoBase; label: string; ayuda: string }[] = [
  { estado: "aplicada", label: "Aplicadas", ayuda: "QMS-TR quedó aplicado en la base" },
  { estado: "en_proceso", label: "En proceso", ayuda: "La base está en una tanda que sigue avanzando" },
  { estado: "pendiente", label: "Liberadas sin tanda", ayuda: "Tienen hito 4 y todavía no entran a una tanda" },
  { estado: "retenida", label: "Retenidas", ayuda: "Tienen hito 3 pero no hito 4" },
  { estado: "revertida", label: "Revertidas", ayuda: "Se devolvieron a su estado anterior a QMS-TR" },
  { estado: "bypass", label: "Sin cambios", ayuda: "El motor no propuso cambios: quedaron fuera del zip" },
  { estado: "sin_hito4", label: "Sin hitos", ayuda: "Todavía sin hito 3 ni hito 4" },
  { estado: "fuera_de_alcance", label: "Fuera de alcance", ayuda: "QMS-TR no corrige estas bases" },
]

export const ESTADO_BASE_LABEL: Record<EstadoBase, string> = {
  aplicada: "Aplicada",
  en_proceso: "En proceso",
  pendiente: "Liberada",
  retenida: "Retenida",
  revertida: "Revertida",
  bypass: "Sin cambios",
  sin_hito4: "Sin hitos",
  fuera_de_alcance: "Fuera de alcance",
}

/** Nombres de las tareas del job qms_tr_run en el progreso (desconocidas se muestran tal cual). */
export const TAREA_LABELS: Record<string, string> = {
  ...STEP_LABELS,
  hay_grandes: "¿Hay grandes?",
  hay_normales: "¿Hay normales?",
}

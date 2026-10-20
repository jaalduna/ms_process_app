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
  /**
   * Cómo se entregan los ajustes (QMSTR_FLUJO_ENTREGA): "ticket" = zip a DQ por Jira; "pythoncac" = DC lanza la
   * tanda y el aplicativo aplica en J con PythonCac, sin ticket, hito 10 ni aviso a MTR (RACI v2).
   */
  entrega?: Entrega
  paises: string[]
  intervalo_segundos: number
  ultima_vuelta: string | null
  /** Resultado de la última vuelta por país ("ok" o el error). */
  resultado: Record<string, string> | null
  error_config: string | null
  /** El usuario actual puede operar las acciones: admin siempre; specialist sólo en simulación. */
  puede_operar: boolean
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
  | "esperando_liberacion"
  | "pendiente"
  | "en_proceso"
  | "aplicada"
  | "revertida"
  | "bypass"
  | "fuera_de_alcance"

export type TipoTanda = "liberacion" | "manual" | "reversion"
export type Entrega = "ticket" | "pythoncac"
export type ModoTanda = "completo" | "solo_correr"
export type EstadoTanda =
  | "detectada"
  | "corriendo"
  | "armando_reversion"
  | "validando"
  | "en_revision"
  | "enviando"
  | "aplicando"
  | "en_dq"
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
  /** Por qué la base quedó sin ajustes en su tanda (falla del motor, tope MWP, equivalencia atípica); null si no. */
  motivo_bypass: string | null
  /** Lo que la corrida pidió revisar de la base antes del ticket (sigue en el zip); null si nada. */
  revisar: string | null
  historial: FlujoBaseEvento[]
}

/** Base observada antes del ticket: `manifest.revisar` de la corrida o un problema en el Excel que se envía. */
export interface TandaRevisar {
  producto: number
  motivo: string
  d_vol_pct?: number
  veces_fuera_de_caja?: number
}

export interface TandaEvento {
  at: string
  estado: EstadoTanda
  detalle: string | null
}

/** Decisión del operador sobre una base observada en la revisión antes del ticket. */
export interface TandaDecision {
  decision: "enviar" | "excluir"
  motivo: string
  por: string
  at: string
}

export interface TandaDecisionCreate {
  producto: number
  decision: TandaDecision["decision"]
  motivo: string
}

export interface TandaEnvio {
  asignado?: boolean
  adjunto?: boolean
  comentario?: boolean
  vinculo?: boolean
  observadores?: boolean
  aviso_mtr?: boolean
  hito10?: boolean
}

/** Tanda = (país, período, número); todas las columnas de `qmstr_flujo_tandas`. */
export interface Tanda {
  /** Tanda manual que reusa una corrida ya hecha (su run_tag): no corrió el motor. */
  run_tag_existente?: string | null
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
  /**
   * Progreso del envío a DQ y de los avisos en Jira, en llaves planas booleanas: `observadores` = MTR quedó como
   * observador del ticket, `aviso_mtr` = comentario con la @mención publicado al validar o revertir la tanda.
   */
  envio: TandaEnvio
  bypass: number[]
  /** producto -> por qué quedó sin ajustes (`manifest.fallidas` de la corrida). */
  bypass_motivos: Record<string, string>
  /**
   * Bases observadas en las validaciones internas antes del ticket (lo que pide la corrida y lo que se ve en el
   * Excel). Con alguna sin decidir, la tanda queda `en_revision`.
   */
  revisar: TandaRevisar[]
  /** producto -> decisión del operador (enviar igual o excluir con motivo). */
  revision: Record<string, TandaDecision>
  /**
   * Motivo por el que la tanda no avanza. "sin permiso <SELECT|INSERT|UPDATE> sobre <tabla> en <país> ..." es un
   * bloqueo por GRANT pendiente (JAA-1442): la tanda sigue sola cuando llega, no es una falla.
   */
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
  /** Instante desde el que se toma el snapshot de J: va después de lo aplicado o revertido. */
  snapshot_desde: string | null
  /** Progreso final guardado, solo cuando la corrida terminó (evita pedir /progreso). */
  progreso: TandaProgreso | null
}

export interface TandaCreate {
  pais: string
  periodo: string
  productos: number[]
  modo: ModoTanda
  forzar: boolean
  nota: string
  /** Reusar una corrida ya hecha (su run_tag) en vez de correr el motor. */
  run_tag?: string
}

export interface TandaRevertir {
  productos: number[]
  motivo: string
  /** El operador vio el aviso de cambios en J posteriores a QMS-TR y confirma pisarlos. */
  confirmar_cambios_posteriores?: boolean
}

/**
 * Cambios en J posteriores a QMS-TR en los actos que QMS-TR tocó en una base (auditoría de J): DC, cuestionamientos,
 * reglas de MKA. Una base con cambios posteriores no se puede revertir.
 */
export interface BloqueoReversion {
  actos: number
  cambios: number
  /** Flg_Motivo → cantidad de cambios */
  motivos: Record<string, number>
  /** columna (o "DELETE") → cantidad de cambios */
  columnas: Record<string, number>
  usuarios: string[]
  desde: string | null
  hasta: string | null
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
  /** Sólo iteraciones completadas OK. */
  productos_listos: number
  /** Iteraciones fallidas; los productos quedan en bypass. */
  productos_fallidos: number
  /** Avance: (listos + fallidos) / total; 100 al terminar la corrida. */
  porcentaje: number
  tareas: ProgresoTarea[]
}

export type TipoAviso = "observadores" | "pase_mtr" | "reversion_aplicada"

export const TIPO_AVISO_LABEL: Record<TipoAviso, string> = {
  observadores: "Observador agregado",
  pase_mtr: "QMS-TR aplicado",
  reversion_aplicada: "Reversión aplicada",
}

export interface AvisoDestinatario {
  account_id: string
  /** La API puede no resolver el nombre del usuario de Jira. */
  nombre: string | null
}

/** GET /qmstr_flujo/avisos — avisos en el ticket de Jira (comentarios y observadores), publicados o simulados. */
export interface FlujoAviso {
  id: string
  tanda_id: string
  pais: string
  periodo: string
  tipo: TipoAviso
  /** LAT-n en modo real; SIM-n en simulación (no existe en Jira); null si la tanda aún no tiene ticket. */
  jira_key: string | null
  texto: string
  destinatarios: AvisoDestinatario[]
  publicado: boolean
  modo: FlujoModo
  at: string
}

/** Estados en que la tanda sigue avanzando sola (ACTIVOS de la API + armando_reversion). */
export const TANDA_ACTIVOS: EstadoTanda[] = [
  "detectada", "corriendo", "armando_reversion", "validando", "en_revision", "enviando", "aplicando", "en_dq", "hito10",
]

/** Camino feliz de cada tipo de tanda, en orden (lo que dibuja el stepper). */
export const CAMINO_TANDA: Record<
  "corrida" | "reversion" | "solo_correr" | "corrida_pythoncac" | "reversion_pythoncac",
  EstadoTanda[]
> = {
  corrida: ["detectada", "corriendo", "validando", "enviando", "en_dq", "hito10", "cerrada"],
  reversion: ["detectada", "armando_reversion", "enviando", "en_dq", "hito10", "cerrada"],
  solo_correr: ["detectada", "corriendo", "cerrada"],
  // entrega directa: el aplicativo aplica en J con PythonCac y la tanda se cierra (DC confirma el pase a MTR)
  corrida_pythoncac: ["detectada", "corriendo", "validando", "aplicando", "cerrada"],
  reversion_pythoncac: ["detectada", "aplicando", "cerrada"],
}

export function caminoDe(t: Pick<Tanda, "tipo" | "modo">, entrega: Entrega = "ticket"): EstadoTanda[] {
  if (t.modo === "solo_correr") return CAMINO_TANDA.solo_correr
  if (entrega === "pythoncac") return t.tipo === "reversion" ? CAMINO_TANDA.reversion_pythoncac : CAMINO_TANDA.corrida_pythoncac
  return t.tipo === "reversion" ? CAMINO_TANDA.reversion : CAMINO_TANDA.corrida
}

export const ESTADO_TANDA_LABEL: Record<EstadoTanda, string> = {
  detectada: "Por correr",
  corriendo: "Corrida en Databricks",
  armando_reversion: "Armando reversión",
  validando: "Validando antes del ticket",
  en_revision: "En revisión antes del ticket",
  enviando: "Creando ticket",
  aplicando: "Aplicando en J",
  en_dq: "Ticket en DQ",
  hito10: "Registrando hito 10",
  cerrada: "Cerrada",
  revision_manual: "Requiere revisión",
  sin_bases: "Sin bases",
}

export const TIPO_TANDA_LABEL: Record<TipoTanda, string> = {
  liberacion: "Liberación",
  manual: "Manual",
  reversion: "Reversión",
}

/**
 * Estados de base en el orden del proceso: DC distribuye (hito 3) y libera (hito 4), QMS-TR corre, DQ aplica el
 * ticket y queda el hito 10. `label` va en plural en la leyenda; `chip` en singular en cada base; `ayuda` es el tooltip.
 */
export const ESTADOS_BASE: { estado: EstadoBase; label: string; chip: string; ayuda: string }[] = [
  { estado: "aplicada", label: "QMS-TR aplicado", chip: "QMS-TR aplicado", ayuda: "DQ cerró el ticket con los ajustes y quedó registrado el hito 10" },
  { estado: "en_proceso", label: "En QMS-TR", chip: "En QMS-TR", ayuda: "Está en una tanda que sigue avanzando: corrida, revisión antes del ticket, ticket en DQ o hito 10" },
  { estado: "pendiente", label: "Listas para QMS-TR", chip: "Lista para QMS-TR", ayuda: "DC registró la liberación metodológica (hito 4) y todavía no entra a una corrida" },
  { estado: "retenida", label: "Retenidas por DC", chip: "Retenida por DC", ayuda: "DC distribuyó los actos (hito 3) pero no la liberó (hito 4), y otras bases del período ya están liberadas" },
  { estado: "esperando_liberacion", label: "Esperando liberación de DC", chip: "Esperando liberación de DC", ayuda: "DC distribuyó los actos (hito 3); ninguna base del período tiene todavía la liberación metodológica (hito 4)" },
  { estado: "revertida", label: "QMS-TR revertido", chip: "QMS-TR revertido", ayuda: "Se devolvió a como estaba antes de QMS-TR y se anuló su hito 10; se puede volver a correr" },
  { estado: "bypass", label: "Sin ajustes de QMS-TR", chip: "Sin ajustes de QMS-TR", ayuda: "La corrida no la corrigió (falló o no pasó un control) o se excluyó en la revisión, y no va en el ticket; el motivo está en la base" },
  { estado: "sin_hito4", label: "Sin distribución de DC", chip: "Sin distribución de DC", ayuda: "DC todavía no registra la distribución de actos (hito 3) ni la liberación (hito 4)" },
  { estado: "fuera_de_alcance", label: "Excluidas de QMS-TR", chip: "Excluida de QMS-TR", ayuda: "Por acuerdo, QMS-TR no corrige esta base (fashion, tabaco)" },
]

export const ESTADO_BASE_LABEL = Object.fromEntries(ESTADOS_BASE.map((e) => [e.estado, e.chip])) as Record<EstadoBase, string>
export const ESTADO_BASE_AYUDA = Object.fromEntries(ESTADOS_BASE.map((e) => [e.estado, e.ayuda])) as Record<EstadoBase, string>
/**
 * Con entrega PythonCac DC lanza QMS-TR al recibir el sign-off de calibración (un correo, no queda en J) y antes de la
 * liberación metodológica (hito 4): "lista" se mide contra la distribución de actos (hito 3) y "sin_hito4" es una base
 * sin distribución de actos.
 */
const ESTADOS_BASE_PYTHONCAC: Partial<Record<EstadoBase, { label: string; chip: string }>> = {
  sin_hito4: { label: "Sin distribución de actos", chip: "Sin distribución de actos" },
}

export function estadosBase(entrega: Entrega): typeof ESTADOS_BASE {
  if (entrega !== "pythoncac") return ESTADOS_BASE
  return ESTADOS_BASE.map((e) => ({ ...e, ...ESTADOS_BASE_PYTHONCAC[e.estado], ayuda: ayudaEstadoBase(e.estado, entrega) }))
}

export function labelEstadoBase(estado: EstadoBase, entrega: Entrega): string {
  return (entrega === "pythoncac" && ESTADOS_BASE_PYTHONCAC[estado]?.chip) || ESTADO_BASE_LABEL[estado]
}

/** Con entrega PythonCac (sin ticket ni hito 10) la ayuda de algunos estados cambia. */
export const ESTADO_BASE_AYUDA_PYTHONCAC: Partial<Record<EstadoBase, string>> = {
  pendiente: "DC distribuyó los actos (hito 3) y todavía no entra a una corrida, o se redistribuyeron después de su última corrida",
  sin_hito4: "DC todavía no registra la distribución de actos de la base (hito 3)",
  aplicada: "El aplicativo aplicó los ajustes en J",
  en_proceso: "Está en una tanda que sigue avanzando: corrida, revisión antes de aplicar o aplicación en J",
  revertida: "Se devolvió en J a como estaba antes de QMS-TR; se puede volver a correr",
  bypass: "La corrida no la corrigió (falló o no pasó un control), no pasó la validación previa a escribir en J o se excluyó en la revisión; el motivo está en el detalle",
}

export function ayudaEstadoBase(estado: EstadoBase, entrega: Entrega): string {
  return (entrega === "pythoncac" && ESTADO_BASE_AYUDA_PYTHONCAC[estado]) || ESTADO_BASE_AYUDA[estado]
}

/** Etiqueta de una base en QMS-TR según el paso de su tanda (más concreta que "En QMS-TR"). */
export const ETAPA_BASE_LABEL: Partial<Record<EstadoTanda, string>> = {
  detectada: "Por correr",
  corriendo: "En corrida",
  armando_reversion: "Armando reversión",
  validando: "Validando antes del ticket",
  en_revision: "En revisión antes del ticket",
  enviando: "Creando ticket",
  aplicando: "Aplicando en J",
  en_dq: "Ticket en DQ",
  hito10: "Registrando hito 10",
  revision_manual: "Requiere revisión",
}

/** Nombres de las tareas del job qms_tr_run en el progreso (desconocidas se muestran tal cual). */
export const TAREA_LABELS: Record<string, string> = {
  ...STEP_LABELS,
  hay_grandes: "¿Hay grandes?",
  hay_normales: "¿Hay normales?",
}

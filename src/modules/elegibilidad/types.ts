export type EligibilityStepName =
  | 'run_pipeline'
  | 'download_results'
  | 'approve'
  | 'apply_sql'
  | 'download_mordom'
  | 'upload_mordom'
  | 'apply_mordom'
  | 'complete'

export interface EligibilityStep {
  name: EligibilityStepName
  label: string
  status: string
  started_at?: string
  completed_at?: string
}

export interface EligibilityFile {
  file_id: string
  run_id: string
  stage: number
  direction: 'download' | 'upload'
  filename: string
  stored_path: string
  file_size_bytes?: number
  uploaded_by?: string
  created_at: string
}

export type EligibilityStatus =
  | 'pending'
  | 'running'
  | 'results_ready'
  | 'applying_sql'
  | 'mordom_downloading'
  | 'mordom_ready'
  | 'mordom_uploaded'
  | 'applying_mordom'
  | 'ready'
  | 'failed'
  | 'cancelled'

export interface EligibilityRun {
  run_id: string
  country: string
  period: number
  status: EligibilityStatus
  parameters_json?: Record<string, unknown>
  phase1_metrics_json?: Record<string, unknown>
  steps?: EligibilityStep[]
  files?: EligibilityFile[]
  current_step?: string
  started_at?: string
  completed_at?: string
  created_by?: string
  created_at: string
  updated_at: string
  /** JAA-1179/JAA-1183: tag de la versión bronze pedida al ejecutar, o `null`/`"sync"` cuando se sincronizó. */
  j_source?: string | null
  /** JAA-1179/JAA-1183: tag efectivo del snapshot bronze que corrió, registrado por la API al completar. */
  snapshot_tag?: string | null
  approved_by?: string
  approved_at?: string
  error_message?: string
}

export interface EligibilityRunCreate {
  country: string
  period: number
  parameters?: Record<string, unknown>
}

export interface EligibilityMetrics {
  elegibles_naturales?: number
  donadores_totales?: number
  receptores_totales?: number
  muertos?: number
  inconsistentes?: number
  buen_colaborador?: number
  [key: string]: number | undefined
}

export const STEP_ORDER: EligibilityStepName[] = [
  'run_pipeline',
  'download_results',
  'approve',
  'apply_sql',
  'download_mordom',
  'upload_mordom',
  'apply_mordom',
  'complete',
]

export const STEP_LABELS: Record<EligibilityStepName, string> = {
  run_pipeline: 'Ejecutar Pipeline',
  download_results: 'Descargar Resultados',
  approve: 'Aprobar',
  apply_sql: 'Aplicar a SQL Server',
  download_mordom: 'Descargar MorDom',
  upload_mordom: 'Subir MorDom corregido',
  apply_mordom: 'Aplicar correcciones MorDom',
  complete: 'Listo',
}

/** Statuses that indicate the pipeline is actively processing. */
export const ACTIVE_STATUSES: EligibilityStatus[] = [
  'running',
  'applying_sql',
  'mordom_downloading',
  'applying_mordom',
]

export const STATUS_CONFIG: Record<
  EligibilityStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }
> = {
  // Tintes suaves sobre tokens semánticos (patrón de wp-calibration-app):
  // los rellenos sólidos amber/green/blue con texto blanco fallaban AA y
  // usaban colores fuera de la paleta Worldpanel.
  pending: { label: 'Pendiente', variant: 'outline', className: '' },
  running: { label: 'Ejecutando...', variant: 'outline', className: 'border-info/30 bg-info/15 text-info' },
  results_ready: { label: 'Pendiente de revisión', variant: 'outline', className: 'border-warning/30 bg-warning/15 text-warning' },
  applying_sql: { label: 'Aplicando a SQL...', variant: 'outline', className: 'border-info/30 bg-info/15 text-info' },
  mordom_downloading: { label: 'Descargando MorDom...', variant: 'outline', className: 'border-info/30 bg-info/15 text-info' },
  mordom_ready: { label: 'Revisar MorDom', variant: 'outline', className: 'border-warning/30 bg-warning/15 text-warning' },
  mordom_uploaded: { label: 'MorDom subido', variant: 'outline', className: 'border-warning/30 bg-warning/15 text-warning' },
  applying_mordom: { label: 'Aplicando MorDom...', variant: 'outline', className: 'border-info/30 bg-info/15 text-info' },
  ready: { label: 'Listo', variant: 'outline', className: 'border-success/30 bg-success/15 text-success' },
  failed: { label: 'Error', variant: 'destructive', className: '' },
  cancelled: { label: 'Cancelado', variant: 'secondary', className: '' },
}

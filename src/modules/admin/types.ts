export interface AuthorizedUser {
  email: string
  name: string
  roles: string[]
  countries: string[]
}

export interface UserBody {
  name?: string
  roles?: string[]
  countries?: string[]
}

export interface JobsConfig {
  defaults: Record<string, string>
  /** {process: {country: databricks_job_id}} */
  jobs: Record<string, Record<string, number>>
}

export interface AdminStage {
  code: string
  name: string
}

export interface StageItem {
  code: string
  name: string
  position?: number
}

/** Known backend roles, for the role picker. Free-text roles remain allowed. */
export const KNOWN_ROLES = [
  "admin",
  "analyst",
  "prices_specialist",
  "eligibility_specialist",
  "weighting_specialist",
  "calibration_specialist",
  "mtr_specialist",
  "formato4_specialist",
  // JAA-1147: el port de PythonCac agregó el rol en el backend pero no acá, así
  // que no había forma de asignarlo desde Admin → Usuarios. Es además el único
  // que gatea la LECTURA de su módulo: sin él, /macrocac/tablas y /motivos dan
  // 403 y el selector queda vacío.
  "macrocac_specialist",
  // QMS-TR: el operador (DC) lanza y opera el flujo en real en sus países; el
  // specialist solo opera con el flujo en simulación.
  "qmstr_operator",
  "qmstr_specialist",
] as const

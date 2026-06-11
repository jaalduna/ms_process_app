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
] as const

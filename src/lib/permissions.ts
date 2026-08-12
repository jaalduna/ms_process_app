/**
 * Perfiles y flags de permisos de la app.
 *
 * Los roles vienen como "app roles" de Entra ID (claim `roles` del ID token,
 * definidos en el app registration del tenant y asignados a usuarios/grupos):
 *   - "admin"   → soporte/diagnóstico: ve el link "Ver en Databricks".
 *   - "usuario" → perfil base; cualquier autenticado del tenant sin rol admin.
 *
 * La UI nunca consulta strings de rol directamente: siempre pasa por estos
 * flags, para que agregar/renombrar roles no requiera tocar componentes.
 */
export const ROLE_ADMIN = "admin"
export const ROLE_USER = "usuario"

/** Texto único del tooltip que explica por qué una acción está deshabilitada por rol. */
export const ADMIN_ONLY_MESSAGE = "Solo disponible para el rol Admin"

export interface Permissions {
  /** Link de diagnóstico al run en el workspace de Databricks (solo admins). */
  canViewDatabricksRun: boolean
  /**
   * Lanzar o cancelar calibraciones. El backend es quien realmente lo impone
   * (`assert_can_trigger`: admin o <stage>_specialist); acá solo reflejamos ese
   * permiso en la UI para no ofrecer un botón que terminaría en 403.
   */
  canTriggerCalibration: boolean
}

export function getPermissions(roles: string[]): Permissions {
  const normalized = roles.map((r) => r.toLowerCase())
  const isAdmin = normalized.includes(ROLE_ADMIN)
  const isSpecialist = normalized.some((r) => r.endsWith("_specialist"))
  return {
    canViewDatabricksRun: isAdmin,
    canTriggerCalibration: isAdmin || isSpecialist,
  }
}

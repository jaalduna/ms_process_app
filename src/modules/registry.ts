import { syncModule } from "./sync"
import { calibracionModule } from "./calibracion"
import { elegibilidadModule } from "./elegibilidad"
import { preciosModule } from "./precios"
import { pesajeModule } from "./pesaje"
import { mtrModule } from "./mtr"
import { formato4Module } from "./formato4"
import { qmstrModule } from "./qmstr"
import { macrocacModule } from "./macrocac"
import { trazabilidadModule } from "./trazabilidad"
import { overviewModule } from "./overview"
import { adminModule } from "./admin"
import { parametrosElegibilidadModule } from "./parametros-elegibilidad"
import { misTicketsModule } from "./mis-tickets"
import type { ModuleDefinition } from "./types"

/**
 * Central module registry.
 * All modules registered.
 * Modules are rendered in the order they appear in this array.
 */
export const allModules: ModuleDefinition[] = [
  overviewModule,
  misTicketsModule,
  syncModule,
  preciosModule,
  elegibilidadModule,
  pesajeModule,
  calibracionModule,
  qmstrModule,
  mtrModule,
  formato4Module,
  macrocacModule,
  trazabilidadModule,
  parametrosElegibilidadModule,
  adminModule,
]

/**
 * Role gate for a module's navigation/route. A module with no `requiredRoles`
 * is open to everyone. Otherwise the user needs at least one of the required
 * roles — except `admin`, which (mirroring the backend `AuthorizedUser.has_role`)
 * implies every role. Single source of truth for the App's `enabledModules`
 * filter and the role-gating tests.
 */
export function hasModuleAccess(module: ModuleDefinition, roles: string[]): boolean {
  if (!module.requiredRoles || module.requiredRoles.length === 0) return true
  // Case-insensitive a propósito: Entra emite los app roles capitalizados
  // ("Admin"), y comparar tal cual dejaba el menú VACÍO para un admin del
  // tenant. La normalización vive en el proveedor de auth, pero esta función la
  // llama todo el ruteo: que no dependa de que la hayan hecho antes.
  const propios = new Set(roles.map((r) => r.toLowerCase()))
  if (propios.has("admin")) return true
  return module.requiredRoles.some((r) => propios.has(r.toLowerCase()))
}

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
import type { ModuleDefinition } from "./types"

/**
 * Central module registry.
 * All modules registered.
 * Modules are rendered in the order they appear in this array.
 */
export const allModules: ModuleDefinition[] = [
  overviewModule,
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

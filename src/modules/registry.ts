import { syncModule } from "./sync"
import { calibracionModule } from "./calibracion"
import { elegibilidadModule } from "./elegibilidad"
import { preciosModule } from "./precios"
import { pesajeModule } from "./pesaje"
import { mtrModule } from "./mtr"
import { trazabilidadModule } from "./trazabilidad"
import type { ModuleDefinition } from "./types"

/**
 * Central module registry.
 * All modules registered.
 * Modules are rendered in the order they appear in this array.
 */
export const allModules: ModuleDefinition[] = [
  syncModule,
  elegibilidadModule,
  pesajeModule,
  calibracionModule,
  preciosModule,
  mtrModule,
  trazabilidadModule,
]

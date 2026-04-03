import { syncModule } from "./sync"
import { calibracionModule } from "./calibracion"
import { elegibilidadModule } from "./elegibilidad"
import { preciosModule } from "./precios"
import { pesajeModule } from "./pesaje"
import type { ModuleDefinition } from "./types"

/**
 * Central module registry.
 * Add new modules here as they are built (MTR, Traceability).
 * Modules are rendered in the order they appear in this array.
 */
export const allModules: ModuleDefinition[] = [
  syncModule,
  elegibilidadModule,
  pesajeModule,
  calibracionModule,
  preciosModule,
]

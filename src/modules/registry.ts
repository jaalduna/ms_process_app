import { syncModule } from "./sync"
import { calibracionModule } from "./calibracion"
import { elegibilidadModule } from "./elegibilidad"
import type { ModuleDefinition } from "./types"

/**
 * Central module registry.
 * Add new modules here as they are built (Prices, Weighting, MTR, Traceability).
 * Modules are rendered in the order they appear in this array.
 */
export const allModules: ModuleDefinition[] = [
  syncModule,
  elegibilidadModule,
  calibracionModule,
]

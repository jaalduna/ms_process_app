import { syncModule } from "./sync"
import { calibracionModule } from "./calibracion"
import { elegibilidadModule } from "./elegibilidad"
import { trazabilidadModule } from "./trazabilidad"
import type { ModuleDefinition } from "./types"

/**
 * Central module registry.
 * Add new modules here as they are built (Prices, Weighting, MTR).
 * Modules are rendered in the order they appear in this array.
 */
export const allModules: ModuleDefinition[] = [
  syncModule,
  elegibilidadModule,
  calibracionModule,
  trazabilidadModule,
]

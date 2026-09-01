import { lazy } from "react"
import type { ModuleDefinition } from "../types"

export const calibracionModule: ModuleDefinition = {
  id: "calibration",
  label: "Calibración",
  group: "pipeline",
  // Entra ID emite "Admin" o "Usuario" (los `value` de los app roles definidos en
  // el app registration). El perfil base debe VER el módulo — monitorear y
  // descargar — y es el backend quien impide que ejecute (`assert_can_trigger`).
  // Se mantienen los nombres heredados del monolito por compatibilidad.
  requiredRoles: [
    "usuario",
    "analyst",
    "calibration_specialist",
    "calibracion_specialist",
  ],
  // El tablero de ejecución (mockup v6) es la vista principal: primera ruta =
  // destino del redirect por defecto del App, y el ítem del sidebar apunta ahí.
  // Un solo ítem en el sidebar: la vista por país sigue ruteable en
  // /calibration (historial/descargas via deep-link) pero sin pestaña propia
  // (pedido usuario 2026-07-29). Se llama "Calibración" —no "Ejecución"— para
  // que el nombre del ítem coincida con el del módulo (pedido 2026-09-01).
  navItems: [
    { path: "/calibration/execute", label: "Calibración" },
  ],
  routes: [
    { path: "/calibration/execute", component: lazy(() => import("./pages/CalibrationRunPage").then(m => ({ default: m.CalibrationRunPage }))) },
    { path: "/calibration", component: lazy(() => import("./pages/CalibrationPage").then(m => ({ default: m.CalibrationPage }))) },
  ],
}

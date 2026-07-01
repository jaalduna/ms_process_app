import { lazy } from "react"
import type { ModuleDefinition } from "../types"

export const trazabilidadModule: ModuleDefinition = {
  id: "traceability",
  label: "Trazabilidad",
  // "analysis" group: Traceability is a cross-cutting data inspection tool,
  // not a pipeline stage. It reads outputs from all pipeline modules.
  group: "analysis",
  // Cross-cutting read-only inspection: analysts (admins see it via override).
  requiredRoles: ["analyst"],
  navItems: [{ path: "/trazabilidad", label: "Trazabilidad" }],
  routes: [
    {
      path: "/trazabilidad",
      component: lazy(() => import("./pages/TrazabilidadPage").then(m => ({ default: m.TrazabilidadPage }))),
    },
  ],
}

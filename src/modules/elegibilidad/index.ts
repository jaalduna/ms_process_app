import { lazy } from "react"
import type { ModuleDefinition } from "../types"

export const elegibilidadModule: ModuleDefinition = {
  id: "elegibilidad",
  label: "Elegibilidad",
  group: "pipeline",
  requiredRoles: ["admin", "eligibility_specialist", "eligibility_approver"],
  navItems: [{ path: "/elegibilidad", label: "Elegibilidad" }],
  routes: [{ path: "/elegibilidad", component: lazy(() => import("./pages/ElegibilidadPage").then(m => ({ default: m.ElegibilidadPage }))) }],
}

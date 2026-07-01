import { lazy } from "react"
import type { ModuleDefinition } from "../types"

export const parametrosElegibilidadModule: ModuleDefinition = {
  id: "parametros-elegibilidad",
  label: "Editor de Parámetros",
  group: "analysis",
  requiredRoles: ["admin"],
  navItems: [{ path: "/parametros-elegibilidad", label: "Editor de Parámetros" }],
  routes: [
    {
      path: "/parametros-elegibilidad",
      component: lazy(() =>
        import("./pages/ParametrosElegibilidadPage").then((m) => ({ default: m.ParametrosElegibilidadPage })),
      ),
    },
  ],
}

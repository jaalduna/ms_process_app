import { lazy } from "react"
import type { ModuleDefinition } from "../types"

export const parametrosModule: ModuleDefinition = {
  id: "parametros",
  label: "Parámetros",
  group: "analysis",
  requiredRoles: ["admin"],
  navItems: [{ path: "/parametros", label: "Parámetros" }],
  routes: [
    {
      path: "/parametros",
      component: lazy(() =>
        import("./pages/ParametrosPage").then(m => ({ default: m.ParametrosPage }))
      ),
    },
  ],
}

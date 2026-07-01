import { lazy } from "react"
import type { ModuleDefinition } from "../types"

export const formato4Module: ModuleDefinition = {
  id: "formato4",
  label: "Formato 4",
  group: "pipeline",
  requiredRoles: ["admin"],
  navItems: [{ path: "/formato4", label: "Formato 4" }],
  routes: [
    {
      path: "/formato4",
      component: lazy(() => import("./pages/Formato4Page").then(m => ({ default: m.Formato4Page }))),
    },
  ],
}

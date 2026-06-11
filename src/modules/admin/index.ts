import { lazy } from "react"
import type { ModuleDefinition } from "../types"

export const adminModule: ModuleDefinition = {
  id: "admin",
  label: "Admin",
  group: "analysis",
  requiredRoles: ["admin"],
  navItems: [{ path: "/admin", label: "Admin" }],
  routes: [
    {
      path: "/admin",
      component: lazy(() => import("./pages/AdminPage").then(m => ({ default: m.AdminPage }))),
    },
  ],
}

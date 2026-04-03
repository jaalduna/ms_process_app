import { lazy } from "react"
import type { ModuleDefinition } from "../types"

export const preciosModule: ModuleDefinition = {
  id: "prices",
  label: "Precios",
  group: "pipeline",
  navItems: [{ path: "/precios", label: "Precios" }],
  routes: [{ path: "/precios", component: lazy(() => import("./pages/PreciosPage").then(m => ({ default: m.PreciosPage }))) }],
}

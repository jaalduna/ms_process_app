import { lazy } from "react"
import type { ModuleDefinition } from "../types"

export const pesajeModule: ModuleDefinition = {
  id: "weighting",
  label: "Pesaje",
  group: "pipeline",
  navItems: [{ path: "/pesaje", label: "Pesaje" }],
  routes: [{ path: "/pesaje", component: lazy(() => import("./pages/PesajePage").then(m => ({ default: m.PesajePage }))) }],
}

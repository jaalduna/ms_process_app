import { lazy } from "react"
import type { ModuleDefinition } from "../types"

export const mtrModule: ModuleDefinition = {
  id: "mtr",
  label: "MTR",
  group: "pipeline",
  navItems: [{ path: "/mtr", label: "MTR" }],
  routes: [{ path: "/mtr", component: lazy(() => import("./pages/MtrPage").then(m => ({ default: m.MtrPage }))) }],
}

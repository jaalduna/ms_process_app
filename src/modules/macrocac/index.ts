import { lazy } from "react"
import type { ModuleDefinition } from "../types"

// Macrocac is an on-demand step (not a pipeline stage): it publishes results to
// the productive SQL Server tables, invoked between pipeline runs. Placeholder
// page for now.
export const macrocacModule: ModuleDefinition = {
  id: "macrocac",
  label: "Macrocac",
  group: "pipeline",
  requiredRoles: ["macrocac_specialist"],
  navItems: [{ path: "/macrocac", label: "Macrocac" }],
  routes: [{ path: "/macrocac", component: lazy(() => import("./pages/MacrocacPage").then(m => ({ default: m.MacrocacPage }))) }],
}

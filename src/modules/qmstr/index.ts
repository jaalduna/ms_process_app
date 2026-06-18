import { lazy } from "react"
import type { ModuleDefinition } from "../types"

// QMS-TR shares the MTR implementation for now; the two pages are expected to
// diverge later, so this module keeps its own copy of the components/hooks.
export const qmstrModule: ModuleDefinition = {
  id: "qmstr",
  label: "QMS-TR",
  group: "pipeline",
  requiredRoles: ["mtr_specialist"],
  navItems: [{ path: "/qms-tr", label: "QMS-TR" }],
  routes: [{ path: "/qms-tr", component: lazy(() => import("./pages/QmsTrPage").then(m => ({ default: m.QmsTrPage }))) }],
}

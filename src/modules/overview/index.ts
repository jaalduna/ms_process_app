import { lazy } from "react"
import type { ModuleDefinition } from "../types"

export const overviewModule: ModuleDefinition = {
  id: "overview",
  label: "Overview",
  group: "pipeline",
  navItems: [
    { path: "/overview", label: "Overview" },
  ],
  routes: [
    { path: "/overview", component: lazy(() => import("./pages/OverviewPage")) },
  ],
}

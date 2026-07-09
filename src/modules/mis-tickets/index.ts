import { lazy } from "react"
import type { ModuleDefinition } from "../types"

export const misTicketsModule: ModuleDefinition = {
  id: "mis-tickets",
  label: "Mis tickets",
  group: "pipeline",
  navItems: [
    { path: "/mis-tickets", label: "Mis tickets" },
  ],
  routes: [
    { path: "/mis-tickets", component: lazy(() => import("./pages/MisTicketsPage")) },
  ],
}

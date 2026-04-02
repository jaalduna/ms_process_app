import type { ComponentType } from "react"

export interface ModuleRoute {
  path: string
  component: React.LazyExoticComponent<ComponentType>
}

export interface ModuleNavItem {
  path: string
  label: string
}

/** Navigation group for organizing modules in the nav bar. */
export type ModuleGroup = "data" | "pipeline" | "analysis"

export const MODULE_GROUP_LABELS: Record<ModuleGroup, string> = {
  data: "Datos",
  pipeline: "Pipeline",
  analysis: "Análisis",
}

/** Display order for module groups in the navigation. */
export const MODULE_GROUP_ORDER: ModuleGroup[] = ["pipeline", "data", "analysis"]

export interface ModuleDefinition {
  id: string
  label: string
  /** Navigation group for categorizing this module. Defaults to "pipeline" if omitted. */
  group?: ModuleGroup
  navItems: ModuleNavItem[]
  routes: ModuleRoute[]
}

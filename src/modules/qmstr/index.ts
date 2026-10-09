import { lazy } from "react"
import type { ModuleDefinition } from "../types"

// QMS-TR (JAA-1401): país + instante -> snapshot de J -> job qms_tr_run (motor v6q) -> zip -> validación en J.
export const qmstrModule: ModuleDefinition = {
  id: "qmstr",
  label: "QMS-TR",
  group: "pipeline",
  requiredRoles: ["admin", "qmstr_specialist", "qms_tr_specialist"],
  navItems: [
    { path: "/qms-tr", label: "QMS-TR" },
    // JAA-1435: flujo automático (liberación -> corrida -> DQ -> J -> hito 10) con override y reversión.
    { path: "/qms-tr/flujo", label: "Flujo QMS-TR" },
  ],
  routes: [
    { path: "/qms-tr", component: lazy(() => import("./pages/QmsTrPage").then(m => ({ default: m.QmsTrPage }))) },
    { path: "/qms-tr/flujo", component: lazy(() => import("./pages/QmsTrFlujoPage").then(m => ({ default: m.QmsTrFlujoPage }))) },
  ],
}

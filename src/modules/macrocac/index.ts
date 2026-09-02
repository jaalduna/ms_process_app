import { lazy } from "react"
import type { ModuleDefinition } from "../types"

// PythonCac is an on-demand step (not a pipeline stage): it publishes results to
// the productive SQL Server tables, invoked between pipeline runs.
//
// La página es el port de `wp-pythoncac-app/frontend` (su AGENTS.md la declara
// fuente de verdad de esta UI). OJO: el motor NO tiene modo simulación — aplica
// y hace COMMIT —, por eso el flujo es subir → verificar formato → confirmar en
// un diálogo → aplicar, y NO el "Ejecutar (dry-run)" que decía antes acá.
//
// El nombre de cara al usuario es "PythonCac" (el del aplicativo, ver
// wp-pythoncac-app). El `id`, la ruta y los nombres del código siguen siendo
// `macrocac`: son el contrato con el backend y con los tests, y renombrarlos es
// un cambio aparte.
export const macrocacModule: ModuleDefinition = {
  id: "macrocac",
  label: "PythonCac",
  group: "pipeline",
  // `macrocac_specialist` es el rol de módulo que el backend exige para operar
  // (`require_role("admin", "macrocac_specialist")` en routes/macrocac.py) y el
  // que Admin → Usuarios asigna por UPN. Sin él acá, un especialista no admin
  // no veía la entrada del sidebar aunque el backend lo aceptara. `admin` no
  // hace falta listarlo: hasModuleAccess lo admite siempre.
  requiredRoles: ["macrocac_specialist"],
  navItems: [{ path: "/macrocac", label: "PythonCac" }],
  routes: [{ path: "/macrocac", component: lazy(() => import("./pages/MacrocacPage").then(m => ({ default: m.MacrocacPage }))) }],
}

import { describe, it, expect } from "vitest"
import { allModules, hasModuleAccess } from "@/modules/registry"
import type { ModuleDefinition } from "@/modules/types"
import { KNOWN_ROLES } from "@/modules/admin/types"

describe("module registry (sidebar source of truth)", () => {
  it("no longer registers the global 'Parametros' module / /parametros route (ac1)", () => {
    expect(allModules.some((m) => m.id === "parametros")).toBe(false)
    const navPaths = allModules.flatMap((m) => m.navItems.map((n) => n.path))
    expect(navPaths).not.toContain("/parametros")
    const routePaths = allModules.flatMap((m) => m.routes.map((r) => r.path))
    expect(routePaths).not.toContain("/parametros")
  })

  it("keeps the per-process Pesaje module and the parametros-elegibilidad module", () => {
    expect(allModules.some((m) => m.id === "weighting")).toBe(true)
    expect(allModules.some((m) => m.navItems.some((n) => n.path === "/parametros-elegibilidad"))).toBe(
      true,
    )
  })
})

describe("módulo PythonCac", () => {
  const macrocac = allModules.find((m) => m.id === "macrocac")!

  it("lo ve un macrocac_specialist sin ser admin", () => {
    expect(hasModuleAccess(macrocac, ["Usuario", "macrocac_specialist"])).toBe(true)
  })

  it("lo sigue viendo un admin", () => {
    expect(hasModuleAccess(macrocac, ["Admin"])).toBe(true)
  })

  it("no lo ve el perfil base sin rol de módulo", () => {
    expect(hasModuleAccess(macrocac, ["Usuario"])).toBe(false)
  })
})

describe("hasModuleAccess: mayúsculas de Entra", () => {
  const modulo = { requiredRoles: ["macrocac_specialist"] } as ModuleDefinition

  it("acepta el 'Admin' capitalizado que emite Entra", () => {
    // El bug real: con `roles.includes("admin")` un admin del tenant se quedaba
    // sin un solo módulo en el sidebar.
    expect(hasModuleAccess(modulo, ["Admin"])).toBe(true)
  })

  it("acepta el rol de módulo en cualquier caja", () => {
    expect(hasModuleAccess(modulo, ["MACROCAC_Specialist"])).toBe(true)
  })

  it("sigue negando a quien no tiene el rol", () => {
    expect(hasModuleAccess(modulo, ["Usuario"])).toBe(false)
  })
})

describe("KNOWN_ROLES: el picker de Admin → Usuarios", () => {
  it("ofrece macrocac_specialist", () => {
    // Sin esto no había forma de dar acceso a PythonCac desde la UI: el rol
    // existía en el backend pero no en la lista del diálogo (JAA-1147).
    expect(KNOWN_ROLES).toContain("macrocac_specialist")
  })

  it("ofrece al menos un rol asignable por cada módulo gateado", () => {
    // No se exige que estén TODOS los alias —pesaje acepta weighting_specialist
    // y pesaje_specialist, calibración otro tanto, herencia del monolito—, sino
    // que ningún módulo quede sin forma de habilitarlo desde la UI. Es el hueco
    // que tuvo macrocac: rol en el backend, ausente del picker.
    const sinRolAsignable = allModules
      .filter((m) => (m.requiredRoles ?? []).some((r) => r.endsWith("_specialist")))
      .filter(
        (m) =>
          !(m.requiredRoles ?? []).some((r) => (KNOWN_ROLES as readonly string[]).includes(r)),
      )
      .map((m) => m.id)
    expect(sinRolAsignable).toEqual([])
  })
})

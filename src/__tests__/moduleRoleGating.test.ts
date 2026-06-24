import { describe, it, expect } from "vitest"
import { allModules, hasModuleAccess } from "@/modules/registry"
import { formato4Module } from "@/modules/formato4"
import type { ModuleDefinition } from "@/modules/types"

/**
 * MTR-34: role gating for the Formato 4 module. `hasModuleAccess` is the single
 * predicate App.tsx uses to build `enabledModules`, so asserting it here proves
 * the nav tab is hidden without the role and shown with it (or with admin).
 */
describe("module role gating (MTR-34)", () => {
  it("formato4 declares the formato4_specialist required role", () => {
    expect(formato4Module.requiredRoles).toContain("formato4_specialist")
  })

  it("hides Formato 4 when the user has no roles (ac1)", () => {
    expect(hasModuleAccess(formato4Module, [])).toBe(false)
  })

  it("hides Formato 4 for an unrelated specialist role (ac1)", () => {
    expect(hasModuleAccess(formato4Module, ["mtr_specialist"])).toBe(false)
  })

  it("shows Formato 4 for the formato4_specialist role (ac1)", () => {
    expect(hasModuleAccess(formato4Module, ["formato4_specialist"])).toBe(true)
  })

  it("shows Formato 4 for admin (admin implies every role) (ac1)", () => {
    expect(hasModuleAccess(formato4Module, ["admin"])).toBe(true)
  })

  it("treats a module without requiredRoles as open to everyone", () => {
    const open: ModuleDefinition = { id: "x", label: "X", group: "pipeline", navItems: [], routes: [] }
    expect(hasModuleAccess(open, [])).toBe(true)
  })

  it("gates every module with requiredRoles against an empty role set", () => {
    for (const m of allModules) {
      if (m.requiredRoles && m.requiredRoles.length > 0) {
        expect(hasModuleAccess(m, [])).toBe(false)
        expect(hasModuleAccess(m, ["admin"])).toBe(true)
      }
    }
  })
})

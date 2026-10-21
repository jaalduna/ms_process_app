import { describe, it, expect } from "vitest"
import { hasModuleAccess } from "@/modules/registry"
import { overviewModule } from "@/modules/overview"
import { syncModule } from "@/modules/sync"
import { preciosModule } from "@/modules/precios"
import { elegibilidadModule } from "@/modules/elegibilidad"
import { pesajeModule } from "@/modules/pesaje"
import { calibracionModule } from "@/modules/calibracion"
import { qmstrModule } from "@/modules/qmstr"
import { mtrModule } from "@/modules/mtr"
import { formato4Module } from "@/modules/formato4"
import { macrocacModule } from "@/modules/macrocac"
import { trazabilidadModule } from "@/modules/trazabilidad"
import { parametrosElegibilidadModule } from "@/modules/parametros-elegibilidad"
import { adminModule } from "@/modules/admin"
import type { ModuleDefinition } from "@/modules/types"

/**
 * MTR-34 introduced per-module role gating via `hasModuleAccess`, the single
 * predicate App.tsx uses to build `enabledModules`. JAA-773 restricts every
 * module except Pesaje, Calibracion and Overview to admin-only, since Azure AD
 * role assignment isn't wired up yet and admin is the only role the team can
 * reliably assign today.
 */
describe("module role gating (JAA-773): admin-only modules", () => {
  const ADMIN_ONLY: ModuleDefinition[] = [
    preciosModule,
    elegibilidadModule,
    qmstrModule,
    mtrModule,
    formato4Module,
    trazabilidadModule,
    macrocacModule,
    syncModule,
    parametrosElegibilidadModule,
    adminModule,
  ]

  // Módulos que además aceptan su rol de especialista (el resto sigue admin-only).
  const ROLES_ESPECIALISTA: Record<string, string[]> = {
    qmstr: ["admin", "qmstr_operator", "qmstr_specialist", "qms_tr_specialist"], // JAA-1401
    macrocac: ["macrocac_specialist"], // a0f8569: el sidebar acepta macrocac_specialist
    elegibilidad: ["admin", "eligibility_specialist", "eligibility_approver"], // SPEC-iteracion: analista y responsable
  }

  it.each(ADMIN_ONLY)("declares requiredRoles ($id)", (m) => {
    expect(m.requiredRoles).toEqual(ROLES_ESPECIALISTA[m.id] ?? ["admin"])
  })

  it.each(Object.entries(ROLES_ESPECIALISTA))("shows %s for its specialist role", (id, roles) => {
    const m = ADMIN_ONLY.find((x) => x.id === id)!
    const especialista = roles.find((r) => r !== "admin")!
    expect(hasModuleAccess(m, [especialista])).toBe(true)
  })

  it.each(ADMIN_ONLY)("hides $id for a user with no roles", (m) => {
    expect(hasModuleAccess(m, [])).toBe(false)
  })

  it.each(ADMIN_ONLY)("hides $id for an unrelated non-admin role", (m) => {
    expect(hasModuleAccess(m, ["pesaje_specialist"])).toBe(false)
  })

  it.each(ADMIN_ONLY)("shows $id for admin", (m) => {
    expect(hasModuleAccess(m, ["admin"])).toBe(true)
  })
})

describe("module role gating (JAA-773): unaffected modules", () => {
  it("overview stays public (no requiredRoles)", () => {
    expect(overviewModule.requiredRoles ?? []).toHaveLength(0)
    expect(hasModuleAccess(overviewModule, [])).toBe(true)
  })

  it("pesaje keeps its own specialist gating, not admin-only", () => {
    expect(pesajeModule.requiredRoles).not.toEqual(["admin"])
    expect(hasModuleAccess(pesajeModule, [])).toBe(false)
    expect(hasModuleAccess(pesajeModule, ["pesaje_specialist"])).toBe(true)
    expect(hasModuleAccess(pesajeModule, ["admin"])).toBe(true)
  })

  it("calibracion keeps its own specialist gating, not admin-only", () => {
    expect(calibracionModule.requiredRoles).not.toEqual(["admin"])
    expect(hasModuleAccess(calibracionModule, [])).toBe(false)
    expect(hasModuleAccess(calibracionModule, ["calibracion_specialist"])).toBe(true)
    expect(hasModuleAccess(calibracionModule, ["admin"])).toBe(true)
  })
})

describe("hasModuleAccess (generic predicate)", () => {
  it("treats a module without requiredRoles as open to everyone", () => {
    const open: ModuleDefinition = { id: "x", label: "X", group: "pipeline", navItems: [], routes: [] }
    expect(hasModuleAccess(open, [])).toBe(true)
  })

  it("admin implies every role", () => {
    const gated: ModuleDefinition = { id: "y", label: "Y", group: "pipeline", requiredRoles: ["some_role"], navItems: [], routes: [] }
    expect(hasModuleAccess(gated, ["admin"])).toBe(true)
  })
})

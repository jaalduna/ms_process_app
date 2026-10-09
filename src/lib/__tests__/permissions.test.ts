import { describe, expect, it } from "vitest"
import { getPermissions } from "../permissions"

describe("getPermissions", () => {
  it("admin ve el link de Databricks", () => {
    expect(getPermissions(["admin"]).canViewDatabricksRun).toBe(true)
  })

  it("acepta el rol admin sin importar mayúsculas (claim de Entra)", () => {
    expect(getPermissions(["Admin"]).canViewDatabricksRun).toBe(true)
  })

  it("perfil usuario no ve el link de Databricks", () => {
    expect(getPermissions(["usuario"]).canViewDatabricksRun).toBe(false)
  })

  it("sin roles asignados = perfil base sin permisos de admin", () => {
    expect(getPermissions([]).canViewDatabricksRun).toBe(false)
  })

  it("solo admin administra el flujo automático de QMS-TR (JAA-1435)", () => {
    expect(getPermissions(["Admin"]).canAdminQmsTrFlujo).toBe(true)
    expect(getPermissions(["qmstr_specialist"]).canAdminQmsTrFlujo).toBe(false)
    expect(getPermissions(["usuario"]).canAdminQmsTrFlujo).toBe(false)
  })
})

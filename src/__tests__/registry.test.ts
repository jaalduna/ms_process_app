import { describe, it, expect } from "vitest"
import { allModules } from "@/modules/registry"

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

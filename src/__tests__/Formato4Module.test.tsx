import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { allModules } from "@/modules/registry"
import { formato4Module } from "@/modules/formato4"
import { Formato4Page } from "@/modules/formato4/pages/Formato4Page"
import { KNOWN_ROLES } from "@/modules/admin/types"

describe("formato4 module scaffold (MTR-28)", () => {
  it("exposes a ModuleDefinition with the expected id/label/route/role (ac1)", () => {
    expect(formato4Module.id).toBe("formato4")
    expect(formato4Module.label).toBe("Formato 4")
    expect(formato4Module.navItems).toEqual([{ path: "/formato4", label: "Formato 4" }])
    expect(formato4Module.routes.map((r) => r.path)).toEqual(["/formato4"])
    expect(formato4Module.requiredRoles).toContain("formato4_specialist")
  })

  it("is registered in the central registry (ac2)", () => {
    expect(allModules.some((m) => m.id === "formato4")).toBe(true)
    const navPaths = allModules.flatMap((m) => m.navItems.map((n) => n.path))
    expect(navPaths).toContain("/formato4")
  })

  it("registers formato4_specialist as a known assignable role", () => {
    expect(KNOWN_ROLES).toContain("formato4_specialist")
  })

  it("renders an empty placeholder page without crashing (ac6)", () => {
    render(<Formato4Page />)
    expect(screen.getByRole("heading", { name: "Formato 4" })).toBeInTheDocument()
  })
})

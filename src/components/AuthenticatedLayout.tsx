import { useState, useEffect, useRef } from "react"
import { Outlet, NavLink, useLocation } from "react-router-dom"
import { useAuth } from "@/hooks/useAuth"
import { useUpdater } from "@/hooks/useUpdater"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { CalibrationProvider } from "@/modules/calibracion/contexts/CalibrationContext"
import type { ModuleDefinition } from "@/modules/types"
import { MODULE_GROUP_LABELS, MODULE_GROUP_ORDER } from "@/modules/types"
import type { ModuleGroup } from "@/modules/types"

interface AuthenticatedLayoutProps {
  modules: ModuleDefinition[]
}

/** Dropdown component for a navigation group. */
function NavGroup({
  group,
  label,
  modules,
  currentPath,
}: {
  group: ModuleGroup
  label: string
  modules: ModuleDefinition[]
  currentPath: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const allPaths = modules.flatMap(m => m.navItems.map(n => n.path))
  const isGroupActive = allPaths.some(
    p => currentPath === p || currentPath.startsWith(p + "/"),
  ) || (group === "data" && currentPath.startsWith("/events/"))

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(prev => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setOpen(prev => !prev)
          }
          if (e.key === "Escape") setOpen(false)
        }}
        className={cn(
          "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          isGroupActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        )}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`${label} navigation group`}
      >
        {label}
        <span className="ml-1 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-md border bg-popover py-1 shadow-md"
          role="menu"
          aria-label={`${label} submenu`}
        >
          {modules.flatMap(m =>
            m.navItems.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "block px-4 py-2 text-sm transition-colors",
                    isActive ||
                      (item.path === "/history" &&
                        currentPath.startsWith("/events/"))
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )
                }
              >
                {item.label}
              </NavLink>
            )),
          )}
        </div>
      )}
    </div>
  )
}

export function AuthenticatedLayout({ modules }: AuthenticatedLayoutProps) {
  const { user, logout } = useAuth()
  const {
    available,
    version: updateVersion,
    downloading,
    progress,
    downloadAndInstall,
  } = useUpdater()
  const location = useLocation()
  const [appVersion, setAppVersion] = useState<string>(APP_VERSION)

  useEffect(() => {
    ;(async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app")
        setAppVersion(await getVersion())
      } catch {
        // Not running in Tauri — keep package.json version
      }
    })()
  }, [])

  // Group modules by their group field
  const grouped = new Map<ModuleGroup, ModuleDefinition[]>()
  for (const m of modules) {
    const g = m.group ?? "pipeline"
    if (!grouped.has(g)) grouped.set(g, [])
    grouped.get(g)!.push(m)
  }

  // If total nav items <= 5, render flat (no dropdowns needed)
  const totalNavItems = modules.reduce((sum, m) => sum + m.navItems.length, 0)
  const useFlat = totalNavItems <= 5

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
      isActive
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
    )

  return (
    <CalibrationProvider>
      <div className="min-h-screen bg-background">
        {/* Update Banner */}
        {available && (
          <div className="bg-blue-600 text-white px-4 py-2 text-center text-sm">
            {downloading ? (
              <span>Downloading update... {progress}%</span>
            ) : (
              <span>
                Update v{updateVersion} available.{" "}
                <button
                  onClick={downloadAndInstall}
                  className="underline font-medium hover:text-blue-100"
                >
                  Install and restart
                </button>
              </span>
            )}
          </div>
        )}

        {/* Top Bar */}
        <header className="border-b bg-card">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
            <div className="flex items-center gap-6">
              <span className="text-lg font-semibold">
                Bridge
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  v{appVersion}
                </span>
              </span>
              <nav
                className="flex gap-1"
                role="navigation"
                aria-label="Main navigation"
              >
                {useFlat
                  ? modules.flatMap(m =>
                      m.navItems.map(item => (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          className={({ isActive }) =>
                            navLinkClass({
                              isActive:
                                isActive ||
                                (item.path === "/history" &&
                                  location.pathname.startsWith("/events/")),
                            })
                          }
                        >
                          {item.label}
                        </NavLink>
                      )),
                    )
                  : MODULE_GROUP_ORDER.filter(g => grouped.has(g)).map(g => (
                      <NavGroup
                        key={g}
                        group={g}
                        label={MODULE_GROUP_LABELS[g]}
                        modules={grouped.get(g)!}
                        currentPath={location.pathname}
                      />
                    ))}
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {user?.name ?? user?.email}
              </span>
              <Button variant="ghost" size="sm" onClick={logout}>
                Cerrar sesión
              </Button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="mx-auto max-w-5xl px-6 py-6">
          <Outlet />
        </main>
      </div>
    </CalibrationProvider>
  )
}

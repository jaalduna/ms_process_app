import { useState, useEffect } from "react"
import { Outlet, NavLink, useLocation } from "react-router-dom"
import { useAuth } from "@/hooks/useAuth"
import { useUpdater } from "@/hooks/useUpdater"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { CalibrationProvider } from "@/modules/calibracion/contexts/CalibrationContext"
import type { ModuleDefinition } from "@/modules/types"
import {
  Tag,
  CheckCircle2,
  Scale,
  SlidersHorizontal,
  Activity,
  RefreshCw,
  Clock,
  Network,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Circle,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

interface AuthenticatedLayoutProps {
  modules: ModuleDefinition[]
}

const PATH_ICONS: Record<string, LucideIcon> = {
  "/precios": Tag,
  "/elegibilidad": CheckCircle2,
  "/pesaje": Scale,
  "/calibration": SlidersHorizontal,
  "/mtr": Activity,
  "/dashboard": RefreshCw,
  "/history": Clock,
  "/trazabilidad": Network,
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
  const [collapsed, setCollapsed] = useState(false)

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

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
      collapsed && "justify-center px-0",
      isActive
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
    )

  return (
    <CalibrationProvider>
      <TooltipProvider>
        <div className="min-h-screen bg-background flex flex-col">
          {/* Update Banner */}
          {available && (
            <div className="bg-blue-600 text-white px-4 py-2 text-center text-sm shrink-0">
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

          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <aside
              className={cn(
                "flex flex-col border-r bg-card shrink-0 transition-all duration-200",
                collapsed ? "w-14" : "w-52",
              )}
            >
              {/* Logo row + toggle */}
              <div className="flex h-12 items-center border-b px-3 shrink-0">
                {!collapsed && (
                  <span className="flex-1 text-base font-semibold truncate">
                    Bridge
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      v{appVersion}
                    </span>
                  </span>
                )}
                <button
                  onClick={() => setCollapsed(c => !c)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
                >
                  {collapsed ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronLeft className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* Nav items */}
              <nav
                className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2"
                role="navigation"
                aria-label="Main navigation"
              >
                {modules.flatMap(m =>
                  m.navItems.map(item => {
                    const Icon = PATH_ICONS[item.path] ?? Circle
                    const isActive =
                      location.pathname === item.path ||
                      (item.path === "/history" &&
                        location.pathname.startsWith("/events/"))

                    if (collapsed) {
                      return (
                        <Tooltip key={item.path}>
                          <TooltipTrigger asChild>
                            <NavLink
                              to={item.path}
                              className={() =>
                                cn(
                                  "flex items-center justify-center rounded-md p-2 transition-colors",
                                  isActive
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                                )
                              }
                              aria-label={item.label}
                            >
                              <Icon className="h-4 w-4" />
                            </NavLink>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            {item.label}
                          </TooltipContent>
                        </Tooltip>
                      )
                    }

                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive: linkActive }) =>
                          navLinkClass({
                            isActive:
                              linkActive ||
                              (item.path === "/history" &&
                                location.pathname.startsWith("/events/")),
                          })
                        }
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    )
                  }),
                )}
              </nav>

              {/* User info + logout */}
              <div className="border-t p-2 shrink-0">
                {!collapsed && (
                  <p className="truncate px-1 pb-2 text-xs text-muted-foreground">
                    {user?.name ?? user?.email}
                  </p>
                )}
                {collapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={logout}
                        className="w-full"
                        aria-label="Cerrar sesión"
                      >
                        <LogOut className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Cerrar sesión</TooltipContent>
                  </Tooltip>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={logout}
                    className="w-full justify-start gap-2"
                  >
                    <LogOut className="h-4 w-4" />
                    Cerrar sesión
                  </Button>
                )}
              </div>
            </aside>

            {/* Page content */}
            <main className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-5xl px-6 py-6">
                <Outlet />
              </div>
            </main>
          </div>
        </div>
      </TooltipProvider>
    </CalibrationProvider>
  )
}

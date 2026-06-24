import { useState, useEffect } from "react"
import { Outlet, NavLink, useLocation } from "react-router-dom"
import { useAuth } from "@/hooks/useAuth"
import { useUpdater } from "@/hooks/useUpdater"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ModeToggle } from "@/components/ModeToggle"
import { BrandMark } from "@/components/BrandMark"
import { FeedbackDialog } from "@/components/FeedbackDialog"
import { cn } from "@/lib/utils"
import { CalibrationProvider } from "@/modules/calibracion/contexts/CalibrationContext"
import type { ModuleDefinition } from "@/modules/types"
import {
  Tag,
  CheckCircle2,
  Scale,
  SlidersHorizontal,
  Activity,
  FileText,
  Gauge,
  DatabaseZap,
  RefreshCw,
  Clock,
  Network,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Circle,
  ArrowDownToLine,
  ShieldCheck,
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
  "/formato4": FileText,
  "/qms-tr": Gauge,
  "/macrocac": DatabaseZap,
  "/dashboard": RefreshCw,
  "/history": Clock,
  "/trazabilidad": Network,
  "/admin": ShieldCheck,
}

function initials(nameOrEmail: string | undefined): string {
  if (!nameOrEmail) return "?"
  const parts = nameOrEmail.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean)
  return parts
    .slice(0, 2)
    .map(p => p[0]!.toUpperCase())
    .join("")
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

  const isItemActive = (path: string) =>
    location.pathname === path ||
    (path === "/history" && location.pathname.startsWith("/events/"))

  return (
    <CalibrationProvider>
      <TooltipProvider>
        <div className="min-h-screen bg-background flex flex-col">
          {/* Update Banner */}
          {available && (
            <div className="flex items-center justify-center gap-2 bg-info px-4 py-1.5 text-center text-sm text-white shrink-0">
              <ArrowDownToLine className="h-3.5 w-3.5" />
              {downloading ? (
                <span>
                  Descargando actualización…{" "}
                  <span className="font-mono tabular-nums">{progress}%</span>
                </span>
              ) : (
                <span>
                  Actualización v{updateVersion} disponible.{" "}
                  <button
                    onClick={downloadAndInstall}
                    className="font-medium underline underline-offset-2 hover:opacity-80"
                  >
                    Instalar y reiniciar
                  </button>
                </span>
              )}
            </div>
          )}

          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <aside
              className={cn(
                "flex flex-col bg-sidebar text-sidebar-foreground shrink-0 transition-all duration-200",
                collapsed ? "w-14" : "w-56",
              )}
            >
              {/* Brand row + toggle */}
              <div
                className={cn(
                  "flex h-14 items-center gap-2.5 border-b border-sidebar-border shrink-0",
                  collapsed ? "justify-center px-0" : "px-3.5",
                )}
              >
                <BrandMark className="h-7 w-7 shrink-0" />
                {!collapsed && (
                  <span className="flex-1 truncate font-display text-base font-semibold text-sidebar-accent-foreground">
                    Bridge
                    <span className="ml-1.5 font-mono text-[10px] font-normal text-sidebar-foreground/60">
                      v{appVersion}
                    </span>
                  </span>
                )}
                {!collapsed && (
                  <button
                    onClick={() => setCollapsed(true)}
                    className="rounded-md p-1 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    aria-label="Colapsar menú"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                )}
              </div>

              {collapsed && (
                <button
                  onClick={() => setCollapsed(false)}
                  className="mx-auto mt-2 rounded-md p-1 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  aria-label="Expandir menú"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}

              {/* Nav items */}
              <nav
                className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2"
                role="navigation"
                aria-label="Main navigation"
              >
                {!collapsed && (
                  <p className="px-3 pb-1.5 pt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-sidebar-foreground/40">
                    Pipeline
                  </p>
                )}
                {modules.flatMap(m =>
                  m.navItems.map(item => {
                    const Icon = PATH_ICONS[item.path] ?? Circle
                    const active = isItemActive(item.path)

                    if (collapsed) {
                      return (
                        <Tooltip key={item.path}>
                          <TooltipTrigger asChild>
                            <NavLink
                              to={item.path}
                              data-telemetry={`nav:${item.label}`}
                              className={cn(
                                "flex items-center justify-center rounded-md p-2 transition-colors",
                                active
                                  ? "bg-sidebar-accent text-sidebar-primary"
                                  : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                              )}
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
                        data-telemetry={`nav:${item.label}`}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                        )}
                      >
                        {/* Active accent rail */}
                        <span
                          className={cn(
                            "absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-sidebar-primary transition-opacity",
                            active ? "opacity-100" : "opacity-0",
                          )}
                          aria-hidden="true"
                        />
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0 transition-colors",
                            active && "text-sidebar-primary",
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    )
                  }),
                )}
              </nav>

              {/* User info + actions */}
              <div className="border-t border-sidebar-border p-2 shrink-0">
                {!collapsed && (
                  <div className="flex items-center gap-2.5 px-1.5 pb-2 pt-1">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent font-mono text-[10px] font-semibold text-sidebar-primary">
                      {initials(user?.name ?? user?.email)}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-xs text-sidebar-foreground/80">
                      {user?.name ?? user?.email}
                    </p>
                  </div>
                )}
                <div className={cn("mb-1", collapsed && "flex justify-center")}>
                  <FeedbackDialog appVersion={appVersion} collapsed={collapsed} />
                </div>
                <div
                  className={cn(
                    "flex items-center gap-1",
                    collapsed && "flex-col",
                  )}
                >
                  <ModeToggle />
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={logout}
                          data-telemetry="logout"
                          className="inline-flex items-center justify-center rounded-md p-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          aria-label="Cerrar sesión"
                        >
                          <LogOut className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">Cerrar sesión</TooltipContent>
                    </Tooltip>
                  ) : (
                    <button
                      onClick={logout}
                      data-telemetry="logout"
                      className="inline-flex flex-1 items-center gap-2 rounded-md px-2 py-2 text-xs font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    >
                      <LogOut className="h-4 w-4" />
                      Cerrar sesión
                    </button>
                  )}
                </div>
              </div>
            </aside>

            {/* Page content */}
            <main className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-5xl px-6 py-8 animate-fade-up">
                <Outlet />
              </div>
            </main>
          </div>
        </div>
      </TooltipProvider>
    </CalibrationProvider>
  )
}

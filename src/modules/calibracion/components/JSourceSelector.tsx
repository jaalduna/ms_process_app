import { useMemo, useRef, useState } from "react"
import { Check, ChevronDown, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { J_SOURCE_SYNC, type JVersion } from "@/types/api"
import { versionSummary } from "../lib/jVersions"

interface JSourceSelectorProps {
  /** Versiones disponibles, más recientes primero. */
  versions: JVersion[]
  /** Tag seleccionado, o `J_SOURCE_SYNC` para sincronizar. */
  value: string
  onChange: (value: string) => void
  /** Fecha del último sync, para no dar a entender que "sincronizar" ya está al día. */
  lastSyncLabel?: string | null
  loading?: boolean
  disabled?: boolean
}

/**
 * Fuente de J al lanzar una calibración: sincronizar, o una versión ya guardada
 * (JAA-1119).
 *
 * El desplegable filtra por texto porque la lista crece una entrada por corrida
 * con contenido nuevo — a los pocos meses son decenas por país. Está construido
 * sobre `Input` + lista filtrada en vez de un combobox de librería: el proyecto
 * no tiene `cmdk` ni el primitivo `Popover` de shadcn instalados, y sumarlos
 * solo por esto no se justificaba.
 */
export function JSourceSelector({
  versions,
  value,
  onChange,
  lastSyncLabel,
  loading = false,
  disabled = false,
}: JSourceSelectorProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return versions
    // Busca sobre el tag y sobre el resumen, así "202607", "_v1" o una fecha
    // acotan igual de bien.
    return versions.filter(
      (v) =>
        v.tag.toLowerCase().includes(q) ||
        versionSummary(v).toLowerCase().includes(q),
    )
  }, [versions, query])

  const selected = versions.find((v) => v.tag === value) ?? null
  const isSync = value === J_SOURCE_SYNC

  function choose(next: string) {
    onChange(next)
    setOpen(false)
    setQuery("")
  }

  return (
    <div
      ref={containerRef}
      className="space-y-2"
      onClick={(e) => e.stopPropagation()}
      // Cierra al salir con el teclado sin obligar a un click fuera.
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node)) setOpen(false)
      }}
    >
      <span className="text-xs font-medium">Fuente de J</span>

      {/* Sincronizar */}
      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="radio"
          name="j-source-mode"
          className="mt-1"
          checked={isSync}
          disabled={disabled}
          onChange={() => choose(J_SOURCE_SYNC)}
          aria-label="Sincronizar J desde SQL Server"
        />
        <span className="text-xs">
          Sincronizar J desde SQL Server
          <span className="block text-muted-foreground">
            {lastSyncLabel
              ? `Trae el estado actual. Último sync: ${lastSyncLabel}.`
              : "Trae el estado actual de SQL Server."}
          </span>
        </span>
      </label>

      {/* Versión guardada */}
      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="radio"
          name="j-source-mode"
          className="mt-1"
          checked={!isSync}
          disabled={disabled || versions.length === 0}
          onChange={() => choose(versions[0]?.tag ?? J_SOURCE_SYNC)}
          aria-label="Usar una versión guardada"
        />
        <span className="text-xs">
          Usar una versión guardada
          <span className="block text-muted-foreground">
            {loading
              ? "Cargando versiones..."
              : versions.length === 0
                ? "No hay versiones registradas para este país todavía."
                : "No se sincroniza: se lee la versión elegida tal como quedó."}
          </span>
        </span>
      </label>

      {!isSync && versions.length > 0 && (
        <div className="relative pl-6">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={open}
            className="flex w-full items-start justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-xs hover:bg-accent disabled:opacity-50"
          >
            <span className="min-w-0 flex-1">
              {/* Sin `truncate`: el sufijo que distingue una versión de otra
                  (`_202607_v2`) va al FINAL del nombre, así que truncar corta
                  justo lo único que importa. `break-all` deja el nombre completo
                  en dos líneas. */}
              <span className="block break-all font-mono leading-tight">
                {selected?.tag ?? "Elegir versión"}
              </span>
              {selected && (
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {versionSummary(selected)}
                </span>
              )}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
          </button>

          {open && (
            // Ensancha más allá de la columna del tablero (360px) para que el
            // nombre entre en una línea; el popup es `absolute`, así que puede
            // desbordar la tarjeta sin romper el layout.
            <div className="absolute z-50 mt-1 w-full min-w-[24rem] max-w-[calc(100vw-2rem)] rounded-md border bg-popover shadow-md">
              <div className="flex items-center gap-2 border-b px-2">
                <Search className="h-3.5 w-3.5 shrink-0 opacity-60" />
                <Input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar (período, _v1, fecha...)"
                  aria-label="Buscar versión de J"
                  className="h-8 border-0 text-xs shadow-none focus-visible:ring-0"
                />
              </div>
              <ul role="listbox" className="max-h-56 overflow-y-auto py-1">
                {filtered.length === 0 && (
                  <li className="px-3 py-2 text-xs text-muted-foreground">
                    Ninguna versión coincide con “{query}”.
                  </li>
                )}
                {filtered.map((v) => (
                  <li key={v.tag}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={v.tag === value}
                      onClick={() => choose(v.tag)}
                      className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-accent"
                    >
                      <Check
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                          v.tag === value ? "opacity-100" : "opacity-0"
                        }`}
                      />
                      <span className="min-w-0">
                        <span className="block break-all font-mono text-xs leading-tight">
                          {v.tag}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {versionSummary(v)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

import * as React from "react"
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export interface ComboboxOption {
  /** Lo que viaja al backend. */
  value: string
  /** Lo que se lee. */
  label: string
  /** Segunda línea: contexto (la base, el patrón que la trajo). */
  hint?: string
}

/**
 * Combobox: un select que además se puede buscar escribiendo.
 *
 * Existe porque la lista de tablas dejó de ser fija —sale de `sys.tables` vía
 * patrones— y un `<Select>` de scroll no se banca decenas de nombres que
 * comparten prefijo (`_BKP_J_AtosCompra_New_1`, `_2`, `_20260805`…). Escribir
 * tres letras es más rápido que buscar a ojo entre nombres casi idénticos.
 *
 * Se implementa a mano (patrón ARIA combobox) en vez de con Radix: el input de
 * filtro dentro de un popover con foco propio es justamente donde Radix Select
 * no llega, y traer `cmdk` por un solo campo no se justifica. La búsqueda
 * ignora mayúsculas y acentos, y matchea tanto la etiqueta como el valor.
 */
export function Combobox({
  value,
  onValueChange,
  options,
  placeholder = "Selecciona una opción",
  searchPlaceholder = "Buscar…",
  emptyMessage = "Sin resultados",
  disabled = false,
  className,
  id,
  "aria-label": ariaLabel,
  "data-testid": testId,
}: {
  value: string
  onValueChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  className?: string
  id?: string
  "aria-label"?: string
  "data-testid"?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [activo, setActivo] = React.useState(0)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listId = React.useId()

  const seleccionada = options.find((o) => o.value === value) ?? null

  const filtradas = React.useMemo(() => {
    const q = normalizar(query)
    if (!q) return options
    return options.filter((o) => normalizar(`${o.label} ${o.value} ${o.hint ?? ""}`).includes(q))
  }, [options, query])

  // El índice activo se acota al renderizar, no por efecto: al filtrar, la lista
  // se acorta y el índice guardado puede quedar fuera de rango por un render.
  const indiceActivo = Math.min(activo, Math.max(filtradas.length - 1, 0))

  const abrir = () => {
    if (disabled) return
    setOpen(true)
    setQuery("")
    // Arranca sobre lo ya elegido: reabrir y dar Enter no cambia nada.
    setActivo(Math.max(options.findIndex((o) => o.value === value), 0))
  }

  const cerrar = () => {
    setOpen(false)
    setQuery("")
  }

  const elegir = (opcion: ComboboxOption) => {
    onValueChange(opcion.value)
    cerrar()
    // Sin `focus()`: el `preventDefault` del mousedown ya evitó que el input lo
    // perdiera, y reenfocarlo dispararía `onFocus` → `abrir()` otra vez.
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      if (!open) return abrir()
      const paso = e.key === "ArrowDown" ? 1 : -1
      setActivo(
        filtradas.length === 0 ? 0 : (indiceActivo + paso + filtradas.length) % filtradas.length,
      )
      return
    }
    if (e.key === "Enter") {
      if (!open) return
      e.preventDefault()
      const opcion = filtradas[indiceActivo]
      if (opcion) elegir(opcion)
      return
    }
    if (e.key === "Escape") {
      if (!open) return
      e.preventDefault()
      cerrar()
      return
    }
    if (e.key === "Tab") cerrar()
  }

  // Clic fuera cierra. Se escucha en el documento porque el listado no es un
  // portal: un `onBlur` del input se dispararía antes del clic en la opción.
  React.useEffect(() => {
    if (!open) return
    const alClickear = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) cerrar()
    }
    document.addEventListener("mousedown", alClickear)
    return () => document.removeEventListener("mousedown", alClickear)
  }, [open])

  const opcionId = (i: number) => `${listId}-opt-${i}`

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="relative">
        <SearchIcon
          className={cn(
            "text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transition-opacity",
            open ? "opacity-100" : "opacity-0",
          )}
          aria-hidden
        />
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtradas.length > 0 ? opcionId(indiceActivo) : undefined}
          aria-label={ariaLabel}
          data-testid={testId}
          disabled={disabled}
          // Cerrado muestra la selección; abierto, lo que se está escribiendo.
          value={open ? query : (seleccionada?.label ?? "")}
          placeholder={open ? searchPlaceholder : placeholder}
          onChange={(e) => {
            if (!open) abrir()
            setQuery(e.target.value)
            setActivo(0)
          }}
          onFocus={abrir}
          onClick={abrir}
          onKeyDown={handleKeyDown}
          className={cn(
            "border-input dark:bg-input/30 h-9 w-full rounded-md border bg-transparent py-1 pr-9 text-base shadow-xs transition-[color,box-shadow,padding] outline-none md:text-sm",
            "placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            open ? "pl-9" : "pl-3",
          )}
        />
        <ChevronDownIcon
          className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2"
          aria-hidden
        />
      </div>

      {/* El listbox existe siempre en el DOM (oculto con `hidden`) para que
          `aria-controls` apunte a algo real incluso cerrado. */}
      <ul
        id={listId}
        role="listbox"
        aria-label={ariaLabel}
        hidden={!open}
        // Más ancho que el campo si hace falta: los nombres de tabla comparten
        // un prefijo largo (`_BKP_J_AtosCompra_New_…`), así que recortarlos al
        // ancho del input deja todas las filas leyéndose igual. `w-max` crece
        // con el contenido, `min-w-full` nunca lo deja más angosto que el campo.
        //
        // El crecimiento es solo de `sm` para arriba: la lista se ancla a la
        // izquierda del campo y crece hacia la derecha, así que en un teléfono
        // se saldría de la pantalla. Ahí queda del ancho del campo y los nombres
        // largos se recorren con el scroll horizontal de la propia lista. El
        // `calc(100vw-6rem)` descuenta el padding de la tarjeta y de la página.
        className="bg-popover text-popover-foreground absolute z-50 mt-1 max-h-64 w-full min-w-full overflow-auto rounded-md border p-1 shadow-md sm:w-max sm:max-w-[min(44rem,calc(100vw-6rem))]"
      >
        {filtradas.length === 0 ? (
          <li className="text-muted-foreground px-2 py-3 text-center text-sm" role="presentation">
            {emptyMessage}
          </li>
        ) : (
          filtradas.map((o, i) => (
            <li
              key={o.value}
              id={opcionId(i)}
              role="option"
              aria-selected={o.value === value}
              // `onMouseDown` y no `onClick`: el input pierde el foco antes del
              // click, y el handler de cierre se comería la selección.
              onMouseDown={(e) => {
                e.preventDefault()
                elegir(o)
              }}
              onMouseEnter={() => setActivo(i)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                i === indiceActivo && "bg-accent text-accent-foreground",
              )}
            >
              <CheckIcon
                className={cn("h-4 w-4 shrink-0", o.value === value ? "opacity-100" : "opacity-0")}
                aria-hidden
              />
              {/* `whitespace-nowrap` sin `truncate`: el nombre completo es el
                  dato que se está eligiendo, y el popover ya crece para darle
                  lugar. El scroll horizontal queda como último recurso. */}
              <span className="flex-1 font-mono text-xs whitespace-nowrap">{o.label}</span>
              {o.hint ? (
                <span className="text-muted-foreground shrink-0 pl-2 text-xs">{o.hint}</span>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

/** Minúsculas y sin acentos: buscar "calibracion" tiene que encontrar "Calibración". */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

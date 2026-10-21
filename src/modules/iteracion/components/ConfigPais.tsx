import { useState, type ComponentType } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ChevronRight } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { usePaises, type Cierre } from "../hooks"
import { FuenteConfigContext } from "../fuenteConfig"
import type { ConfigPais, TablaConfigPais } from "../types"

/** Una entrada de la configuración permanente del país: qué tablas cubre y su editor. */
export interface ItemConfigPais {
  id: string
  etiqueta: string
  detalle: string
  /** Tablas de `config_pais.tablas` que edita (para mostrar su última publicación). */
  tablas: string[]
  Editor: ComponentType<{ codigo: string; pais: string; paisNombre: string; onPublicado: () => void }>
}

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })

/** Lo último publicado entre las tablas del ítem, o null si todas siguen con lo del código. */
function ultimaPublicacion(tablas: TablaConfigPais[], de: string[]): TablaConfigPais | null {
  const pub = tablas.filter((t) => de.includes(t.tabla) && t.publicado_en)
  return pub.sort((a, b) => b.publicado_en!.localeCompare(a.publicado_en!))[0] ?? null
}

/**
 * «Configuración del país», bajo los parámetros de la vuelta: lo que es del país y no de esta
 * vuelta. Cada fila abre su editor en un panel lateral; lo publicado ahí vale para todos los
 * cierres del país y el próximo cálculo ya lo usa.
 */
export function ConfigPaisSeccion({ items, config, cierre }: {
  items: ItemConfigPais[]
  config: ConfigPais
  cierre: Cierre
}) {
  const qc = useQueryClient()
  const paises = usePaises(cierre.proceso)
  const [abierto, setAbierto] = useState<string | null>(null)
  const item = items.find((i) => i.id === abierto)
  const paisNombre = paises.data?.find((p) => p.id === cierre.pais)?.label ?? cierre.pais
  // la API devuelve las versiones nuevas en /parametros: así el resultado queda pendiente de calcular
  const onPublicado = () => qc.invalidateQueries({ queryKey: ["iteracion", cierre.proceso, cierre.pais] })

  return (
    <div className="space-y-1.5 border-t pt-4" data-testid="it-config-pais">
      <div>
        <h3 className="text-sm font-medium">Configuración del país</h3>
        <p className="text-xs text-muted-foreground">Permanente: lo que publiques vale para todos los cierres de {paisNombre}.</p>
      </div>
      <ul className="divide-y rounded-lg border">
        {/* solo lo que el proceso usa en este país (la API lista sus tablas) */}
        {items.filter((it) => it.tablas.every((t) => config.tablas.some((x) => x.tabla === t))).map((it) => {
          const u = ultimaPublicacion(config.tablas, it.tablas)
          return (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => setAbierto(it.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/40"
                data-testid={`it-config-${it.id}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{it.etiqueta}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {u ? `Publicado ${fecha(u.publicado_en!)}${u.publicado_por ? ` · ${u.publicado_por.split("@")[0]}` : ""}` : "Del código del proceso"}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            </li>
          )
        })}
      </ul>
      <Sheet
        open={!!item}
        onOpenChange={(o) => {
          if (o) return
          setAbierto(null)
          // los editores de cada tabla publican por su cuenta: al cerrar se releen las versiones
          onPublicado()
        }}
      >
        <SheetContent side="right" className="w-[min(1100px,96vw)] gap-0 overflow-y-auto sm:max-w-none">
          {item && (
            <>
              <SheetHeader className="pr-12">
                <SheetTitle>
                  {item.etiqueta} · {paisNombre}
                </SheetTitle>
                <SheetDescription>
                  {item.detalle} Se publica para todo el país, no solo para esta vuelta; el próximo cálculo ya lo usa.
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">
                <FuenteConfigContext.Provider value={cierre}>
                  <item.Editor codigo={config.codigo} pais={cierre.pais} paisNombre={paisNombre} onPublicado={onPublicado} />
                </FuenteConfigContext.Provider>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

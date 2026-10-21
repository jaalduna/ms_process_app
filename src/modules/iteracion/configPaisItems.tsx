// Qué tablas forman la configuración permanente del país en cada proceso y con qué editor se
// abren. Los editores son los de siempre; acá solo se ordenan y se fija el país del cierre.
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { CodeParametrosTab } from "@/modules/parametros-elegibilidad/components/CodeParametrosTab"
import { CriteriosTab } from "@/modules/parametros-elegibilidad/components/CriteriosTab"
import { EXTRA_TABS } from "@/modules/parametros-elegibilidad/components/extraTabs"
import { ProductosExcluidos } from "@/modules/parametros-elegibilidad/components/ProductosExcluidos"
import type { Producto } from "@/modules/parametros-elegibilidad/exclusiones"
import { TablasElegibilidad } from "@/modules/parametros-elegibilidad/pages/ParametrosElegibilidadPage"
import type { ElegCountry } from "@/modules/parametros-elegibilidad/types"
import { ValoresPorDefectoPesaje } from "@/modules/pesaje/components/PesajeParametrosTab"
import { IdPesoTab } from "@/modules/pesaje/params/IdPesoTab"
import { UniversoTab } from "@/modules/pesaje/params/UniversoTab"
import { VariablesTab } from "@/modules/pesaje/params/VariablesTab"
import type { CountryCode } from "@/modules/pesaje/params/types"
import type { ItemConfigPais } from "./components/ConfigPais"

/** Nombres de producto del país, para mostrar algo más que el IdProduto. */
function useProductos(pais: string) {
  return useQuery({
    queryKey: ["iteracion", "elegibilidad", pais, "productos"],
    queryFn: () => api.get<Producto[]>(`/iteracion/elegibilidad/${pais}/productos`).then((r) => r.data),
    staleTime: 60 * 60_000,
    retry: false,
  })
}

const region = EXTRA_TABS.find((t) => t.value === "parametros-region")!

export const CONFIG_PAIS_ELEGIBILIDAD: ItemConfigPais[] = [
  {
    id: "productos",
    etiqueta: "Productos excluidos",
    detalle: "Productos que no cuentan para decidir si un hogar es elegible, que no se imputan, o las dos cosas.",
    tablas: ["Criterios_Elegibilidad_ExCateg", "Imputacion_ExCateg"],
    Editor: function Productos({ codigo, pais, onPublicado }) {
      const q = useProductos(pais)
      return <ProductosExcluidos codigo={codigo} productos={q.isError ? null : q.data} onPublicado={onPublicado} />
    },
  },
  {
    id: "criterios",
    etiqueta: "Criterios de elegibilidad",
    detalle: "Reglas de actos, categorías y semanas que hacen elegible a un hogar.",
    tablas: ["Criterios_Elegibilidad"],
    Editor: ({ codigo }) => <CriteriosTab country={codigo as ElegCountry} />,
  },
  {
    id: "region",
    etiqueta: "Parámetros por región",
    detalle: "Llenado mínimo y topes que reemplazan a los del país en regiones puntuales.",
    tablas: ["Parametros_Region"],
    Editor: ({ codigo }) => <>{region.render(codigo as ElegCountry)}</>,
  },
  {
    id: "valores",
    etiqueta: "Valores del país de los parámetros",
    detalle: "Con qué valores parte cada cierre (Code_Parametros); en la vuelta se ajustan arriba.",
    tablas: ["Code_Parametros"],
    Editor: ({ codigo }) => <CodeParametrosTab country={codigo as ElegCountry} />,
  },
  {
    id: "todas",
    etiqueta: "Todas las tablas",
    detalle: "Editor completo, una pestaña por tabla de la configuración de Elegibilidad.",
    tablas: [],
    Editor: ({ codigo }) => <TablasElegibilidad country={codigo as ElegCountry} />,
  },
]

export const CONFIG_PAIS_PESAJE: ItemConfigPais[] = [
  {
    id: "valores",
    etiqueta: "Valores del país de los parámetros",
    detalle: "Con qué valores parte cada cierre; en la vuelta se ajustan arriba.",
    tablas: ["idpeso-config"],
    Editor: ({ codigo, paisNombre }) => <ValoresPorDefectoPesaje code={codigo as CountryCode} country={paisNombre} />,
  },
  {
    id: "variables",
    etiqueta: "Variables de ponderación",
    detalle: "Variables de cuotas (Q) y marginales (M) del IPF.",
    tablas: ["variables"],
    Editor: ({ codigo, paisNombre }) => <VariablesTab pais={codigo} country={paisNombre} />,
  },
  {
    id: "universo",
    etiqueta: "Universo",
    detalle: "Universo publicado del país. Para probar cambios en una sola vuelta usa «Universo por segmento».",
    tablas: ["universo"],
    Editor: ({ codigo, paisNombre }) => <UniversoTab pais={codigo} country={paisNombre} />,
  },
  {
    id: "idpesos",
    etiqueta: "IdPesos",
    detalle: "Esquemas de ponderación que existen para el país.",
    tablas: [],
    Editor: ({ codigo, paisNombre }) => <IdPesoTab pais={codigo} country={paisNombre} />,
  },
]

// Qué tablas forman la configuración permanente del país en cada proceso y con qué editor se
// abren. Los editores son los de siempre; acá solo se ordenan y se fija el país del cierre.
// Fuera por ahora: Parametros_Region (el contrato no trae actos_bajo ni viajes_bajo, que el
// proceso lee), el Universo (se publica solo por Excel) e IdPesos (sale del código de Pesaje).
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { CodeParametrosTab } from "@/modules/parametros-elegibilidad/components/CodeParametrosTab"
import { CriteriosTab } from "@/modules/parametros-elegibilidad/components/CriteriosTab"
import { ProductosExcluidos } from "@/modules/parametros-elegibilidad/components/ProductosExcluidos"
import type { Producto } from "@/modules/parametros-elegibilidad/exclusiones"
import type { ElegCountry } from "@/modules/parametros-elegibilidad/types"
import { ValoresPorDefectoPesaje } from "@/modules/pesaje/components/PesajeParametrosTab"
import { VariablesTab } from "@/modules/pesaje/params/VariablesTab"
import type { CountryCode } from "@/modules/pesaje/params/types"
import type { ItemConfigPais } from "./components/ConfigPais"
import { useFuenteConfig } from "./fuenteConfig"

/** Nombres de producto del país, para mostrar algo más que el IdProduto. */
function useProductos() {
  const f = useFuenteConfig()!
  return useQuery({
    queryKey: ["iteracion", "elegibilidad", f.pais, f.periodo, "productos"],
    queryFn: () => api.get<Producto[]>(`/iteracion/elegibilidad/${f.pais}/${f.periodo}/productos`).then((r) => r.data),
    staleTime: 60 * 60_000,
    retry: false,
  })
}

export const CONFIG_PAIS_ELEGIBILIDAD: ItemConfigPais[] = [
  {
    id: "productos",
    etiqueta: "Productos excluidos",
    detalle: "Productos que no cuentan para decidir si un hogar es elegible, que no se imputan, o las dos cosas.",
    tablas: ["Criterios_Elegibilidad_ExCateg", "Imputacion_ExCateg"],
    Editor: function Productos({ codigo, onPublicado }) {
      const q = useProductos()
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
    id: "valores",
    etiqueta: "Valores del país de los parámetros",
    detalle: "Con qué valores parte cada cierre (Code_Parametros); en la vuelta se ajustan arriba.",
    tablas: ["Code_Parametros"],
    Editor: ({ codigo }) => <CodeParametrosTab country={codigo as ElegCountry} />,
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
]

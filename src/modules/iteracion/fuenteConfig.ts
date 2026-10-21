// Desde qué cierre leen los editores de la configuración del país. Dentro de la iteración, lo
// vigente para el proceso (lo publicado o, si no hay, lo del código) sale de
// `/iteracion/{proceso}/{pais}/{periodo}/config/{tabla}`; las rutas propias de cada editor solo
// devuelven lo guardado en su base, que en dev puede estar vacío.
import { createContext, useContext } from "react"
import { api } from "@/lib/api"

export interface FuenteConfig {
  proceso: "elegibilidad" | "pesaje"
  pais: string
  periodo: string
}

export interface TablaVigente<C = unknown> {
  tabla: string
  codigo: string
  origen: "codigo" | "publicado"
  version: string | null
  publicado_en: string | null
  publicado_por: string | null
  contenido: C
}

export const FuenteConfigContext = createContext<FuenteConfig | null>(null)

export const useFuenteConfig = () => useContext(FuenteConfigContext)

export const getTablaVigente = <C>(f: FuenteConfig, tabla: string) =>
  api.get<TablaVigente<C>>(`/iteracion/${f.proceso}/${f.pais}/${f.periodo}/config/${tabla}`).then((r) => r.data)

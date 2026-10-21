// Espacio a todo el ancho bajo las dos columnas del paso Iterar (parámetros | resultados): las
// secciones anchas del resultado se dibujan ahí sin dejar de vivir en su componente.
import { createContext, useContext } from "react"

export const AnchoCompletoContext = createContext<HTMLElement | null>(null)

export const useAnchoCompleto = () => useContext(AnchoCompletoContext)

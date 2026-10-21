import { IteracionWorkspace } from "@/modules/iteracion/components/IteracionWorkspace"
import { PESAJE } from "@/modules/iteracion/config"

// La configuración del país vive bajo los parámetros de la vuelta (paso Iterar).
export function PesajePage() {
  return <IteracionWorkspace config={PESAJE} />
}

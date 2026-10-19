import { ProcessWorkspaceTabs } from "@/components/ProcessWorkspaceTabs"
import { IteracionWorkspace } from "@/modules/iteracion/components/IteracionWorkspace"
import { PESAJE } from "@/modules/iteracion/config"
import { PesajeParametrosTab } from "../components/PesajeParametrosTab"

export function PesajePage() {
  return (
    <ProcessWorkspaceTabs
      tabs={[
        { value: "cierre", label: "Cierre", content: <IteracionWorkspace config={PESAJE} /> },
        { value: "parametros", label: "Configuración del país", content: <PesajeParametrosTab /> },
      ]}
    />
  )
}

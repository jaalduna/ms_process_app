import { DatabaseZap } from "lucide-react"

export function MacrocacPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Macrocac</h1>
        <p className="text-sm text-muted-foreground">
          Publicación bajo demanda de resultados a las tablas productivas
        </p>
      </div>

      {/* Placeholder */}
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <DatabaseZap className="h-6 w-6" />
        </div>
        <div className="max-w-md space-y-2">
          <p className="text-base font-medium">Próximamente</p>
          <p className="text-sm text-muted-foreground">
            Macrocac es un proceso bajo demanda que se ejecuta entre las etapas del
            pipeline. Su función es subir los resultados a las tablas productivas en
            los servidores SQL. Esta página está en construcción.
          </p>
        </div>
      </div>
    </div>
  )
}
